/** The `sense` command: runs every sensor for one unit and gathers the results into one sense document. */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { buildLogArgs, computeCoChange, computeHotspots, parseNumstatLog } from './git-history.ts';
import type { SenseDocument, SensorResult } from './schemas.ts';
import { parseCoverageSummary, parseJunit } from './test-reports.ts';

/** A repository check that `sense` runs through the shell, such as a linter or a typecheck. */
export interface CheckSpec {
  name: string;
  command: string;
}

/** What `sense` measures, and where it writes. */
export interface SenseOptions {
  root: string;
  unit: string;
  windowDays: number;
  /** The sense document's path; each check's log is written beside it. */
  out: string;
  checks: readonly CheckSpec[];
  excludeGlobs: readonly string[];
  coverageSummary: string | undefined;
  junit: string | undefined;
}

/** The outcome of one check command: its exit code, or the reason that it could not be spawned. */
export type CheckOutcome = { exitCode: number } | { spawnError: string };

/** The processes that `sense` starts, injected so that tests can supply fixtures. */
export interface SenseDependencies {
  git(args: readonly string[], cwd: string): string;
  runCheck(command: string, cwd: string, logPath: string): CheckOutcome;
}

/** Sensor names that a check may not take, because the built-in sensors use them. */
export const RESERVED_SENSOR_NAMES: readonly string[] = ['co-change', 'coverage', 'hotspots', 'timings'];

/** The adapter that runs git and the check commands. */
export const realSenseDependencies: SenseDependencies = {
  git(args, cwd) {
    const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1_024 * 1_024 });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0] ?? ''} failed: ${result.stderr.trim()}`);
    return result.stdout;
  },
  runCheck(command, cwd, logPath) {
    const fd = openSync(logPath, 'w');
    try {
      const result = spawnSync(command, { cwd, shell: true, stdio: ['ignore', fd, fd] });
      if (result.error !== undefined) return { spawnError: describeError(result.error) };
      return { exitCode: result.status ?? 1 };
    } finally {
      closeSync(fd);
    }
  },
};

/**
 * Runs every sensor and returns the sense document. A sensor that fails or does not apply is recorded with its status
 * and reason; only a failure to read the repository's `HEAD` or file list stops the run.
 */
export function runSense(options: SenseOptions, dependencies: SenseDependencies): SenseDocument {
  const { root, unit } = options;
  const commit = dependencies.git(['rev-parse', 'HEAD'], root).trim();
  const tracked = new Set(dependencies.git(['ls-files', '-z', '--', unit], root).split('\0').filter(Boolean));
  const gitVersion = readGitVersion(dependencies, root);

  const sensors: SensorResult[] = [];
  let windowStart: string | null = null;
  try {
    const commits = parseNumstatLog(
      dependencies.git(buildLogArgs(unit, options.windowDays, options.excludeGlobs), root),
    );
    windowStart = commits.at(-1)?.date ?? null;
    const lineCounts = countLines(
      root,
      commits.flatMap((change) => change.files).filter((file) => tracked.has(file)),
    );
    sensors.push(
      buildResult('hotspots', gitVersion, 'ok', null, null, computeHotspots(commits, lineCounts)),
      buildResult('co-change', gitVersion, 'ok', null, null, computeCoChange(commits, tracked)),
    );
  } catch (error) {
    const detail = describeError(error);
    sensors.push(
      buildResult('hotspots', gitVersion, 'failed', detail, null, null),
      buildResult('co-change', gitVersion, 'failed', detail, null, null),
    );
  }

  sensors.push(
    readReport('coverage', options.coverageSummary, root, (text) => parseCoverageSummary(JSON.parse(text), root, unit)),
    readReport('timings', options.junit, root, parseJunit),
  );

  const outDir = path.dirname(options.out);
  for (const check of options.checks) sensors.push(runCheckSensor(check, root, outDir, dependencies));

  return { unit, windowDays: options.windowDays, windowStart, commit, sensors };
}

// region | Helpers

/** Builds one sensor result. */
function buildResult(
  name: string,
  version: string | null,
  status: SensorResult['status'],
  detail: string | null,
  outputPath: string | null,
  data: unknown,
): SensorResult {
  return { name, version, status, detail, outputPath, data };
}

/** Counts the lines of each file that is present on disk, keyed by its repository-relative path. */
function countLines(root: string, files: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  const unique = new Set(files);
  for (const file of unique) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, 'utf8');
    counts.set(file, text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
  }
  return counts;
}

/** Returns the version that `git --version` reports, or null when it cannot be read. */
function readGitVersion(dependencies: SenseDependencies, root: string): string | null {
  try {
    return dependencies.git(['--version'], root).trim();
  } catch {
    return null;
  }
}

/** Reads and parses a report file; an absent flag is `not-applicable`, and an unreadable report is `failed`. */
function readReport(
  name: string,
  file: string | undefined,
  root: string,
  parse: (text: string) => unknown,
): SensorResult {
  if (file === undefined) return buildResult(name, null, 'not-applicable', 'no report was given', null, null);
  const absolute = path.resolve(root, file);
  try {
    return buildResult(name, null, 'ok', null, absolute, parse(readFileSync(absolute, 'utf8')));
  } catch (error) {
    return buildResult(name, null, 'failed', describeError(error), absolute, null);
  }
}

/**
 * Runs one check and records its exit code. A non-zero exit is evidence rather than a sensor failure; a command that
 * could not be spawned, or that the shell could not find or execute (126, 127), is `failed`.
 */
function runCheckSensor(check: CheckSpec, root: string, outDir: string, dependencies: SenseDependencies): SensorResult {
  const logPath = path.join(outDir, `${check.name}.log`);
  const outcome = dependencies.runCheck(check.command, root, logPath);
  if ('spawnError' in outcome) return buildResult(check.name, null, 'failed', outcome.spawnError, logPath, null);
  if (outcome.exitCode === 126 || outcome.exitCode === 127) {
    return buildResult(check.name, null, 'failed', `the shell exited ${outcome.exitCode}`, logPath, null);
  }
  return buildResult(check.name, null, 'ok', null, logPath, { exitCode: outcome.exitCode });
}

// endregion | Helpers

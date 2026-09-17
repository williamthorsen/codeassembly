/* eslint n/no-process-exit: off -- CLI script: `--help` and an argument error each exit with a status of their own. */
/* eslint unicorn/no-process-exit: off -- CLI script: `--help` and an argument error each exit with a status of their own. */
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { resolveProjectsDir } from '~/src/config.ts';
import { foldEvents } from '~/src/event-folder.ts';
import { parseRunRawData } from '~/src/parsers/run-data-parser.ts';
import { RunDataParseError } from '~/src/run-data-parse-error.ts';
import { discoverRunDirectories, type RunDirectoryEntry } from '~/src/scanners/run-directory-scanner.ts';
import type { CanonicalRunStatus } from '~/src/types/canonical.ts';
import type { RunEvent } from '~/src/types/run-log.ts';

import { type ScoreResult, scoreRun } from './demo-scorer.ts';

const DEFAULT_TOP = 5;

interface Options {
  top: number;
  project: string | undefined;
  since: Date | undefined;
  json: boolean;
  help: boolean;
}

interface RankedRun {
  projectSlug: string;
  ticketId: string;
  runId: string;
  score: number;
  signals: ScoreResult['signals'];
  summary: string;
  startedAt: string;
}

/** Ranks the runs in the artifact archive by demo-worthiness and prints the top N. */
async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  const basePath = await resolveProjectsDir(process.cwd());
  process.stderr.write(`[pick-demo-runs] scanning ${basePath}\n`);

  const entries = await discoverRunDirectories(basePath);
  const filteredEntries = opts.project ? entries.filter((e) => e.projectSlug === opts.project) : entries;

  const ranked = await rankEntries(filteredEntries, opts);

  if (ranked.length === 0) {
    process.stdout.write('No runs matched the given filters.\n');
    return;
  }

  const topN = ranked.slice(0, opts.top);
  process.stdout.write(opts.json ? renderJson(topN) : renderMarkdown(topN));
}

/**
 * Scores each run that parses and passes the `--since` filter, then sorts by score, newest first among equal scores.
 */
async function rankEntries(entries: RunDirectoryEntry[], opts: Options): Promise<RankedRun[]> {
  const ranked: RankedRun[] = [];
  const now = new Date();

  for (const entry of entries) {
    const parsed = await safeParse(entry);
    if (!parsed) continue;

    const { status, events } = parsed;

    if (opts.since && !passesSinceFilter(status.startedAt, opts.since)) continue;

    const result = scoreRun(status, events, now);
    ranked.push({
      projectSlug: entry.projectSlug,
      ticketId: entry.ticketId,
      runId: entry.runId,
      score: result.score,
      signals: result.signals,
      summary: result.summary,
      startedAt: status.startedAt,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.startedAt.localeCompare(a.startedAt));
  return ranked;
}

/** Parses a run directory, logging and skipping on any parse error. */
async function safeParse(
  entry: RunDirectoryEntry,
): Promise<{ status: CanonicalRunStatus; events: RunEvent[] } | undefined> {
  try {
    const { header, events } = await parseRunRawData(entry.runPath);
    const status = foldEvents(header, events);
    return { status, events };
  } catch (error) {
    const reason = error instanceof RunDataParseError ? error.category : describeError(error);
    process.stderr.write(
      `[pick-demo-runs] skipping ${entry.projectSlug}/${entry.ticketId}/${entry.runId}: ${reason}\n`,
    );
    return undefined;
  }
}

/** Returns true when the run started on or after `since`. An unparseable start time fails the filter. */
function passesSinceFilter(startedAt: string, since: Date): boolean {
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return false;
  return started >= since.getTime();
}

// -- Rendering --

/** Renders the rows as a Markdown table with padded columns. */
function renderMarkdown(rows: ReadonlyArray<RankedRun>): string {
  const paths = rows.map((r) => `${r.projectSlug}/${r.ticketId}/${r.runId}`);
  const pathWidth = Math.max(4, ...paths.map((p) => p.length));
  const scoreWidth = Math.max(5, ...rows.map((r) => String(r.score).length));
  const summaryWidth = Math.max(7, ...rows.map((r) => r.summary.length));

  const header = `| ${'path'.padEnd(pathWidth)} | ${'score'.padStart(scoreWidth)} | ${'summary'.padEnd(summaryWidth)} |`;
  const separator = `| ${'-'.repeat(pathWidth)} | ${'-'.repeat(scoreWidth)} | ${'-'.repeat(summaryWidth)} |`;
  const lines = rows.map((r, i) => {
    const path = paths[i] ?? '';
    return `| ${path.padEnd(pathWidth)} | ${String(r.score).padStart(scoreWidth)} | ${r.summary.padEnd(summaryWidth)} |`;
  });

  return [header, separator, ...lines, ''].join('\n');
}

/** Renders the rows as JSON, omitting `startedAt`. */
function renderJson(rows: ReadonlyArray<RankedRun>): string {
  const payload = rows.map(({ startedAt: _startedAt, ...rest }) => rest);
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// -- Argument parsing --

/** Parses the command-line arguments, exiting with an error on an unknown option or an invalid value. */
function parseArgs(args: ReadonlyArray<string>): Options {
  let top = DEFAULT_TOP;
  let project: string | undefined;
  let since: Date | undefined;
  let json = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        json = true;
        break;
      case '--top':
        top = parseTopValue(requireValue(args, i, '--top'));
        i++;
        break;
      case '--project':
        project = requireValue(args, i, '--project');
        i++;
        break;
      case '--since':
        since = parseSinceValue(requireValue(args, i, '--since'));
        i++;
        break;
      default:
        fail(`Unknown option "${arg}"`);
    }
  }

  return { top, project, since, json, help };
}

/** Returns the value that follows a flag, exiting when the value is missing or is another flag. */
function requireValue(args: ReadonlyArray<string>, index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

/** Parses the `--top` value as a positive integer, exiting on any other input. */
function parseTopValue(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    fail(`--top must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

/** Parses the `--since` value as a date, exiting when the date is invalid. */
function parseSinceValue(raw: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    fail(`--since must be a valid ISO date, got "${raw}"`);
  }
  return date;
}

/** Writes the error to stderr and exits with status 1. */
function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/** Prints the usage text to stdout. */
function printUsage(): void {
  process.stdout.write(`Usage: pnpm exec tsx packages/run-core/scripts/pick-demo-runs.ts [options]

Rank orchestrated runs in the artifact archive by demo-worthiness.

Options:
  --top <n>          Top-N runs to return (default: ${String(DEFAULT_TOP)})
  --project <slug>   Restrict to a single project slug
  --since <date>     ISO date; include runs started on or after this date
  --json             Emit JSON instead of markdown
  --help, -h         Show this help message
`);
}

await main();

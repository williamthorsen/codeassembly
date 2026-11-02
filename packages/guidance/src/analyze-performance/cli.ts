/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for the performance analysis.
 *
 * `collect` measures each URL with PSI or the Lighthouse CLI and writes the raw responses with a manifest; `summarize`
 * reduces that directory to medians, threshold classes, field data, and merged insights. Every command prints one JSON
 * result.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { collect, type CollectDependencies, DEFAULT_RUNS, realCollectDependencies } from './collect.ts';
import { ManifestSchema } from './schemas.ts';
import { summarize } from './summarize.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  root: string;
  collect: CollectDependencies;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);

const COMMANDS = ['collect', 'summarize'] as const;

type FlagName = 'in' | 'out' | 'private' | 'runs' | 'url';

const REPEATABLE_FLAGS: ReadonlySet<FlagName> = new Set(['private', 'url']);

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'in', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'private', takesValue: true },
  { name: 'runs', takesValue: true },
  { name: 'url', takesValue: true },
];

/** A failure that a command reports as a structured result rather than throwing to `main`. */
class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Executes the helper from `process.argv`, writing the JSON result to stdout and exiting non-zero on a failure. */
async function main(): Promise<void> {
  try {
    const result = await runCli(process.argv.slice(2), { root: process.cwd(), collect: realCollectDependencies });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`analyze-performance: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'analyze-performance')) {
  await main();
}

/** Runs one command. Invalid arguments and unreadable input become structured `{ ok: false }` results. */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'collect':
        return await runCollect(flags, context);
      case 'summarize':
        return runSummarize(flags, context);
      default:
        throw new CommandError('invalid-args', `expected a command (${COMMANDS.join(', ')}), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Measures every `--url` and reports each page's tool, fallback, field-data source, and run outcomes. */
async function runCollect(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const urls = flags.get('url') ?? [];
  if (urls.length === 0) throw new CommandError('invalid-args', '--url is required');
  const privateUrls = new Set(flags.get('private'));
  for (const url of [...urls, ...privateUrls]) {
    if (!/^https?:\/\//.test(url) || !URL.canParse(url)) {
      throw new CommandError('invalid-args', `expected an http or https URL, got "${url}"`);
    }
  }
  const runs = parseRuns(readSingle(flags, 'runs'));
  const out = path.resolve(context.root, readRequired(flags, 'out'));

  const manifest = await collect({ urls, privateUrls, runs, out, cwd: context.root }, context.collect);
  const pages = manifest.pages.map((page) => ({
    url: page.url,
    slug: page.slug,
    tool: page.tool,
    fallbackReason: page.fallbackReason,
    fieldSource: page.fieldSource,
    fieldUnavailableReason: page.fieldUnavailableReason,
    runsSucceeded: page.runs.filter((run) => run.error === null).length,
    errors: [...new Set(page.runs.map((run) => run.error).filter((error) => error !== null))],
  }));
  if (pages.every((page) => page.runsSucceeded === 0)) {
    const code = manifest.pages.some((page) => page.tool === 'lighthouse') ? 'lighthouse-failed' : 'psi-failed';
    throw new CommandError(code, `every run failed: ${pages.flatMap((page) => page.errors).join('; ')}`);
  }
  return { ok: true, out, manifest: path.join(out, 'manifest.json'), pages };
}

/** Summarizes the run directory at `--in`. */
function runSummarize(flags: ParsedFlags, context: CommandContext): CommandResult {
  const directory = path.resolve(context.root, readRequired(flags, 'in'));
  const manifestPath = path.join(directory, 'manifest.json');
  let text: string;
  try {
    text = readFileSync(manifestPath, 'utf8');
  } catch (error) {
    throw new CommandError('input-not-found', `could not read ${manifestPath}: ${describeError(error)}`);
  }
  let manifest;
  try {
    manifest = ManifestSchema.parse(JSON.parse(text));
  } catch (error) {
    throw new CommandError('invalid-input', `${manifestPath} is not a valid manifest: ${describeError(error)}`);
  }
  try {
    return { ok: true, ...summarize(manifest, directory) };
  } catch (error) {
    throw new CommandError('invalid-input', `a raw file under ${directory} could not be read: ${describeError(error)}`);
  }
}

// region | Helpers

/** Parsed flags: every value of each flag in the order given. */
type ParsedFlags = ReadonlyMap<FlagName, readonly string[]>;

/** Scans the command's flags, refusing a positional argument and a repeated single-value flag. */
function parseFlags(argv: readonly string[]): ParsedFlags {
  let scanned;
  try {
    scanned = scanFlags(argv, FLAG_SPECS);
  } catch (error) {
    throw new CommandError('invalid-args', describeError(error));
  }
  if (scanned.positionals.length > 0) {
    throw new CommandError('invalid-args', `unexpected argument "${scanned.positionals[0]}"`);
  }
  const flags = new Map<FlagName, string[]>();
  for (const flag of scanned.flags) {
    const values = flags.get(flag.name) ?? [];
    if (values.length > 0 && !REPEATABLE_FLAGS.has(flag.name)) {
      throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    }
    values.push(flag.value ?? '');
    flags.set(flag.name, values);
  }
  return flags;
}

/** Parses `--runs` as a whole number from 1 to 10. */
function parseRuns(value: string | undefined): number {
  if (value === undefined) return DEFAULT_RUNS;
  const runs = Number(value);
  if (!Number.isSafeInteger(runs) || runs < 1 || runs > MAX_RUNS) {
    throw new CommandError('invalid-args', `--runs expects a whole number from 1 to ${MAX_RUNS}, got "${value}"`);
  }
  return runs;
}

/** Returns the value of a required flag, throwing `invalid-args` when it is absent or empty. */
function readRequired(flags: ParsedFlags, name: FlagName): string {
  const value = readSingle(flags, name);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${name} is required`);
  return value;
}

/** Returns the single value of a flag, or undefined when it is absent. */
function readSingle(flags: ParsedFlags, name: FlagName): string | undefined {
  return flags.get(name)?.[0];
}

/**
 * Caps `--runs`, since PSI's quota and a Lighthouse run's minute make more runs costly without steadying the median.
 */
const MAX_RUNS = 10;

// endregion | Helpers

/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for the code-health assessment.
 *
 * `sense` runs the sensors for one unit and writes the sense document. Every command prints one JSON result.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEntryPoint } from '../lib/is-entry-point.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import {
  type CheckSpec,
  realSenseDependencies,
  RESERVED_SENSOR_NAMES,
  runSense,
  type SenseDependencies,
} from './sense.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  root: string;
  sense: SenseDependencies;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);

/** The hotspot window, in days, when `--window` is not given. */
export const DEFAULT_WINDOW_DAYS = 180;

const COMMANDS = ['sense'] as const;

type FlagName = 'check' | 'coverage-summary' | 'exclude' | 'junit' | 'out' | 'root' | 'unit' | 'window';

const REPEATABLE_FLAGS: ReadonlySet<FlagName> = new Set(['check', 'exclude']);

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'check', takesValue: true },
  { name: 'coverage-summary', takesValue: true },
  { name: 'exclude', takesValue: true },
  { name: 'junit', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'root', takesValue: true },
  { name: 'unit', takesValue: true },
  { name: 'window', takesValue: true },
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
function main(): void {
  try {
    const result = runCli(process.argv.slice(2), { root: process.cwd(), sense: realSenseDependencies });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`assess-code-health: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint(import.meta.url, 'assess-code-health')) {
  main();
}

/** Runs one command. Invalid arguments and a failure to read the repository become structured `{ ok: false }` results. */
export function runCli(argv: readonly string[], context: CommandContext): CommandResult {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'sense':
        return runSenseCommand(flags, context);
      default:
        throw new CommandError('invalid-args', `expected a command (${COMMANDS.join(', ')}), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Writes the sense document to `--out` and reports each sensor's status. */
function runSenseCommand(flags: ParsedFlags, context: CommandContext): CommandResult {
  const root = path.resolve(context.root, readSingle(flags, 'root') ?? '.');
  const unit = readRequired(flags, 'unit');
  const out = path.resolve(context.root, readRequired(flags, 'out'));
  const windowDays = parseWindow(readSingle(flags, 'window'));
  const checks = (flags.get('check') ?? []).map(parseCheck);
  const names = new Set<string>();
  for (const { name } of checks) {
    if (RESERVED_SENSOR_NAMES.includes(name) || names.has(name)) {
      throw new CommandError('invalid-args', `--check name "${name}" is reserved or repeated`);
    }
    names.add(name);
  }
  const coverageSummary = readSingle(flags, 'coverage-summary');
  const junit = readSingle(flags, 'junit');

  mkdirSync(path.dirname(out), { recursive: true });
  let document;
  try {
    document = runSense(
      { root, unit, windowDays, out, checks, excludeGlobs: flags.get('exclude') ?? [], coverageSummary, junit },
      context.sense,
    );
  } catch (error) {
    throw new CommandError('git-failed', describeError(error));
  }
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return {
    ok: true,
    out,
    sensors: document.sensors.map(({ name, status, detail }) => ({ name, status, detail })),
  };
}

// region | Helpers

/** Parsed flags: every value of each flag in the order given. */
type ParsedFlags = ReadonlyMap<FlagName, readonly string[]>;

/** Splits `--check name=command` at its first `=`. */
function parseCheck(value: string): CheckSpec {
  const separator = value.indexOf('=');
  const name = separator === -1 ? '' : value.slice(0, separator);
  const command = separator === -1 ? '' : value.slice(separator + 1);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name) || command.trim() === '') {
    throw new CommandError('invalid-args', `--check expects name=command with a kebab-case name, got "${value}"`);
  }
  return { name, command };
}

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

/** Parses `--window` as a positive whole number of days. */
function parseWindow(value: string | undefined): number {
  if (value === undefined) return DEFAULT_WINDOW_DAYS;
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new CommandError('invalid-args', `--window expects a positive whole number of days, got "${value}"`);
  }
  return days;
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

// endregion | Helpers

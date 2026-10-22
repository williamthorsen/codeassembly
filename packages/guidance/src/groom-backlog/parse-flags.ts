import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { CommandError } from './command.ts';

/** Returns whether `value` is one of `options`. */
export function isOneOf<T extends string>(options: readonly T[], value: string): value is T {
  return new Set<string>(options).has(value);
}

/** Parsed flags: each repeatable flag's values in order, and each other flag's single value. */
export type ParsedFlags = ReadonlyMap<FlagName, string[]>;

/** Scans the command's flags, refusing a positional argument and a repeated single-valued flag. */
export function parseFlags(argv: readonly string[]): ParsedFlags {
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
    if (values.length > 0 && !REPEATABLE.has(flag.name)) {
      throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    }
    flags.set(flag.name, [...values, flag.value ?? '']);
  }
  return flags;
}

/** Parses `value` as a positive integer for `--name`, throwing `invalid-args` otherwise. */
export function parsePositiveInteger(name: FlagName, value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CommandError('invalid-args', `--${name} must be a positive integer, got "${value}"`);
  }
  return parsed;
}

/** Returns the single value of `name`, or `undefined` when it is absent. */
export function readOptional(flags: ParsedFlags, name: FlagName): string | undefined {
  return flags.get(name)?.[0];
}

/** Returns the single value of `name`, throwing `invalid-args` when it is absent. */
export function readRequired(flags: ParsedFlags, name: FlagName): string {
  const value = readOptional(flags, name);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${name} is required`);
  return value;
}

// region | Helpers

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'children', takesValue: true },
  { name: 'decided-by', takesValue: true },
  { name: 'decision', takesValue: true },
  { name: 'exclude-label', takesValue: true },
  { name: 'limit', takesValue: true },
  { name: 'number', takesValue: true },
  { name: 'older-than', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'page-size', takesValue: true },
  { name: 'reason', takesValue: true },
  { name: 'run', takesValue: true },
  { name: 'scope', takesValue: true },
  { name: 'superseded-by', takesValue: true },
  { name: 'ticket', takesValue: true },
];

type FlagName =
  | 'children'
  | 'decided-by'
  | 'decision'
  | 'exclude-label'
  | 'limit'
  | 'number'
  | 'older-than'
  | 'out'
  | 'page-size'
  | 'reason'
  | 'run'
  | 'scope'
  | 'superseded-by'
  | 'ticket';

/** The flags that a command repeats; every other flag may appear once. */
const REPEATABLE: ReadonlySet<FlagName> = new Set(['exclude-label', 'scope']);

// endregion | Helpers

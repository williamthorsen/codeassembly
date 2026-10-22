import path from 'node:path';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import type { Note } from './types.ts';

const COMMANDS = ['copy-probe', 'describe-set', 'record-index', 'register', 'render', 'resolve-ids'] as const;

type Command = (typeof COMMANDS)[number];

const COMMAND_NAMES: ReadonlySet<string> = new Set(COMMANDS);

const FLAGS: readonly FlagSpec[] = [
  { name: 'description', takesValue: true },
  { name: 'file', takesValue: true },
  { name: 'inputs', takesValue: true },
  { name: 'lens', takesValue: true },
  { name: 'note', takesValue: true },
  { name: 'number', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'screenshot', takesValue: true },
  { name: 'set-dir', takesValue: true },
  { name: 'set-title', takesValue: true },
  { name: 'slug', takesValue: true },
  { name: 'slugs', takesValue: true },
  { name: 'source', takesValue: true },
  { name: 'title', takesValue: true },
  { name: 'url', takesValue: true },
];

const COMMAND_FLAGS: Record<Command, { required: readonly string[]; optional: readonly string[] }> = {
  'copy-probe': { required: [], optional: [] },
  'describe-set': { required: ['file', 'set-dir'], optional: [] },
  'record-index': { required: ['set-dir', 'url'], optional: [] },
  register: {
    required: ['set-dir', 'slug', 'title', 'url'],
    optional: ['description', 'inputs', 'lens', 'note', 'number', 'screenshot', 'set-title', 'source'],
  },
  render: { required: ['out', 'set-dir'], optional: [] },
  'resolve-ids': { required: ['set-dir', 'slugs'], optional: [] },
};

/**
 * Parses argv into a command and its flags, throwing on an unknown command, a flag that the command does not take, a
 * missing required flag, an empty value, or a note that is not `<label>: <value>`.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const [command, extra] = positionals;
  if (command === undefined) {
    throw new Error(`a command is required: ${COMMANDS.join(', ')}`);
  }
  if (!isCommand(command)) {
    throw new Error(`unknown command "${command}"; expected one of ${COMMANDS.join(', ')}`);
  }
  if (extra !== undefined) {
    throw new Error(`unexpected argument: ${extra}`);
  }

  const noteFlags = flags.filter((flag) => flag.name === 'note');
  const values = valueFlagMap(flags.filter((flag) => flag.name !== 'note'));
  const { required, optional } = COMMAND_FLAGS[command];
  if (noteFlags.length > 0 && !optional.includes('note')) {
    throw new Error(`${command} does not take --note`);
  }
  for (const [name, value] of Object.entries(values)) {
    if (!required.includes(name) && !optional.includes(name)) {
      throw new Error(`${command} does not take --${name}`);
    }
    if (value === '') {
      throw new Error(`--${name} requires a value`);
    }
  }
  for (const name of required) {
    if (values[name] === undefined) {
      throw new Error(`${command} requires --${name}`);
    }
  }
  const notes = noteFlags.map((flag) => parseNote(flag.value ?? ''));
  return { command, values, notes };
}

/** A parsed invocation: the command, its single-valued flags keyed by flag name, and its `--note` flags in order. */
export interface ParsedArgs {
  command: Command;
  values: Record<string, string>;
  notes: Note[];
}

/** Splits a comma-separated `--inputs` value into trimmed, non-empty items. */
export function parseInputs(value: string | undefined): string[] {
  if (value === undefined) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Returns a required flag's value, which `parseArgs` has already guaranteed. */
export function requireFlag(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) {
    throw new Error(`--${name} is missing after parsing`);
  }
  return value;
}

/** Resolves the required `--set-dir` value to an absolute path. */
export function resolveSetDir(values: Record<string, string>): string {
  return path.resolve(requireFlag(values, 'set-dir'));
}

// region | Helpers

/** Returns true when `value` names a helper command. */
function isCommand(value: string): value is Command {
  return COMMAND_NAMES.has(value);
}

/** Splits a `--note` value at its first colon into a trimmed label and value, throwing when either is empty. */
function parseNote(text: string): Note {
  const colon = text.indexOf(':');
  const label = colon === -1 ? '' : text.slice(0, colon).trim();
  const value = colon === -1 ? '' : text.slice(colon + 1).trim();
  if (label === '' || value === '') {
    throw new Error(`--note "${text}" must have the form "<label>: <value>"`);
  }
  return { label, value };
}

// endregion | Helpers

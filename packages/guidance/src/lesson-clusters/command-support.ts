/** The pieces that every `lesson-clusters` command shares: its failure type, its flags, and its file input and output. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import type { z } from 'zod';

import type { ClusterViolation } from './types.ts';

export type FlagName = 'batch-size' | 'batches' | 'defer-days' | 'inventory' | 'lessons' | 'map' | 'out' | 'store';

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult =
  | { ok: false; error: string; message: string; violations?: ClusterViolation[] }
  | ({ ok: true } & Record<string, unknown>);

/** Parsed flags: each flag's value. */
export type ParsedFlags = ReadonlyMap<FlagName, string>;

/** A failure that a command reports as a structured result rather than throwing to `main`. */
export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly violations?: ClusterViolation[],
  ) {
    super(message);
  }
}

/** Returns the count of violations as a phrase, such as "1 violation". */
export function describeViolations(count: number): string {
  return `${count} ${count === 1 ? 'violation' : 'violations'}`;
}

/** Reads, parses, and validates the JSON file named by a flag, throwing `file-not-found` or `invalid-file`. */
export async function readJsonFile<Schema extends z.ZodType>(
  flags: ParsedFlags,
  flag: FlagName,
  schema: Schema,
  cwd: string,
): Promise<z.infer<Schema>> {
  return readJsonPath(path.resolve(cwd, readRequired(flags, flag)), schema);
}

/** Reads, parses, and validates a JSON file, throwing `file-not-found` or `invalid-file`. */
export async function readJsonPath<Schema extends z.ZodType>(file: string, schema: Schema): Promise<z.infer<Schema>> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    throw new CommandError('file-not-found', `could not read ${file}: ${describeError(error)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CommandError('invalid-file', `${file} is not JSON: ${describeError(error)}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new CommandError('invalid-file', `${file}: ${issues.join('; ')}`);
  }
  return parsed.data;
}

/** Returns a flag's value as a positive integer, or `undefined` when the flag is absent. */
export function readPositiveInteger(flags: ParsedFlags, flag: FlagName): number | undefined {
  const value = flags.get(flag);
  if (value === undefined) return undefined;
  const number = Number(value);
  if (value === '' || !Number.isSafeInteger(number) || number < 1) {
    throw new CommandError('invalid-args', `--${flag} must be a positive integer (got "${value}")`);
  }
  return number;
}

/** Returns the value of a required flag, throwing `invalid-args` when it is absent or empty. */
export function readRequired(flags: ParsedFlags, flag: FlagName): string {
  const value = flags.get(flag);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${flag} <value> is required`);
  return value;
}

/** Writes `value` as indented JSON, creating the parent directory. */
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

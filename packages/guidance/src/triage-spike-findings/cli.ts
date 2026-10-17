/* eslint n/no-process-exit: off -- CLI entry point: The process must exit with the helper's resolved exit code, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/**
 * CLI entry for the triage of a findings artifact.
 *
 * Three commands, each printing one JSON result: `check-labels` reports which graded labels the repository has;
 * `validate` parses a dispositions record and applies the gate; `render` writes the dispositions comment and the
 * per-issue comments from a record. The helper does not write anything remote: The skill creates the tickets through
 * `create-ticket` and posts the comments.
 */
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { checkLabels, runCommand } from './labels.ts';
import { orderItems } from './order.ts';
import { renderDispositionsComment, renderIssueComments } from './render.ts';
import { checkGate, type DispositionsRecord, findMissingTickets, RecordSchema } from './schemas.ts';
import type { CommandRunner } from './types.ts';

/** Everything a command reads from its environment, injected so that tests can supply fixtures. */
export interface CommandContext {
  root: string;
  run: CommandRunner;
}

/** A command's result: a success payload, or a structured failure that the helper reports at exit 1. */
export type CommandResult = { ok: false; error: string; message: string } | ({ ok: true } & Record<string, unknown>);

const COMMANDS = ['check-labels', 'render', 'validate'] as const;

type FlagName = 'file' | 'out' | 'preview' | 'root';

const FLAG_SPECS: ReadonlyArray<FlagSpec<FlagName>> = [
  { name: 'file', takesValue: true },
  { name: 'out', takesValue: true },
  { name: 'preview', takesValue: false },
  { name: 'root', takesValue: true },
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
    const result = await runCli(process.argv.slice(2), { root: process.cwd(), run: runCommand });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`triage-spike-findings: ${describeError(error)}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Runs one command. Invalid arguments, a missing or invalid record, a gate violation, a record whose tickets are not yet
 * created, and a failed `gh` call become structured `{ ok: false }` results.
 */
export async function runCli(argv: readonly string[], context: CommandContext): Promise<CommandResult> {
  const [command, ...rest] = argv;
  try {
    const flags = parseFlags(rest);
    switch (command) {
      case 'check-labels':
        return await runCheckLabels(flags, context);
      case 'render':
        return runRender(flags, context);
      case 'validate':
        return runValidate(flags, context);
      default:
        throw new CommandError('invalid-args', `expected a command (${COMMANDS.join(', ')}), got "${command ?? ''}"`);
    }
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.code, message: error.message };
    return { ok: false, error: 'command-failed', message: describeError(error) };
  }
}

/** Reports the repository's standing against the `confidence:` and `value:` label families. */
async function runCheckLabels(flags: ParsedFlags, context: CommandContext): Promise<CommandResult> {
  const root = path.resolve(context.root, flags.get('root') ?? '.');
  try {
    return { ok: true, ...(await checkLabels(context.run, root)) };
  } catch (error) {
    throw new CommandError('gh-failed', `gh label list failed: ${describeError(error)}`);
  }
}

/**
 * Writes the dispositions comment and one comment per issue named by a `comment` disposition under `--out`. Without
 * `--preview`, refuses while a `ticket` item or the umbrella does not have a number, and writes nothing.
 */
function runRender(flags: ParsedFlags, context: CommandContext): CommandResult {
  const record = readRecord(flags, context);
  const out = path.resolve(context.root, readRequired(flags, 'out'));
  const missing = findMissingTickets(record);
  if (!flags.has('preview') && (missing.umbrella || missing.items.length > 0)) {
    const parts = [...(missing.umbrella ? ['the umbrella'] : []), ...missing.items];
    throw new CommandError(
      'tickets-missing',
      `${parts.join(', ')} ${parts.length === 1 ? 'does not have' : 'do not have'} a ticket number; pass --preview to render placeholders`,
    );
  }
  mkdirSync(out, { recursive: true });
  const commentPath = path.join(out, 'dispositions-comment.md');
  writeFileSync(commentPath, renderDispositionsComment(record), 'utf8');
  const issueComments = [...renderIssueComments(record)].map(([issue, body]) => {
    const file = path.join(out, `comment-${issue}.md`);
    writeFileSync(file, body, 'utf8');
    return { issue, path: file };
  });
  return { ok: true, preview: flags.has('preview'), dispositionsComment: commentPath, issueComments };
}

/** Parses the record at `--file`, applies the gate, and reports the item counts and the items' display order. */
function runValidate(flags: ParsedFlags, context: CommandContext): CommandResult {
  const record = readRecord(flags, context);
  return {
    ok: true,
    items: record.items.length,
    byDisposition: countBy(record.items.map((item) => item.disposition)),
    byConfidence: countBy(record.items.map((item) => item.confidence)),
    byValue: countBy(record.items.map((item) => item.value)),
    missingTickets: findMissingTickets(record),
    order: orderItems(record).map((item) => item.id),
  };
}

// region | Helpers

/** Parsed flags: each flag's value, or `''` for a boolean flag. */
type ParsedFlags = ReadonlyMap<FlagName, string>;

/** Counts each distinct value of `values`, keyed by the value. */
function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

/** Returns whether this module is the process's entry point. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    process.stderr.write(`triage-spike-findings: warning: could not determine entry point: ${describeError(error)}\n`);
    return false;
  }
}

/** Scans the command's flags, refusing a positional argument and a repeated flag. */
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
  const flags = new Map<FlagName, string>();
  for (const flag of scanned.flags) {
    if (flags.has(flag.name)) throw new CommandError('invalid-args', `--${flag.name} may be given once`);
    flags.set(flag.name, flag.value ?? '');
  }
  return flags;
}

/** Reads and parses the record at `--file`, throwing `record-not-found`, `invalid-record`, or `gate-violation`. */
function readRecord(flags: ParsedFlags, context: CommandContext): DispositionsRecord {
  const file = path.resolve(context.root, readRequired(flags, 'file'));
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new CommandError('record-not-found', `could not read ${file}: ${describeError(error)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new CommandError('invalid-record', `${file} is not JSON: ${describeError(error)}`);
  }
  const parsed = RecordSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new CommandError('invalid-record', issues.join('; '));
  }
  const violations = checkGate(parsed.data);
  if (violations.length > 0) {
    const clauses = violations.map((violation) => `${violation.id}: ${violation.clause}`);
    throw new CommandError('gate-violation', clauses.join('; '));
  }
  return parsed.data;
}

/** Returns the value of a required flag, throwing `invalid-args` when it is absent. */
function readRequired(flags: ParsedFlags, name: FlagName): string {
  const value = flags.get(name);
  if (value === undefined || value === '') throw new CommandError('invalid-args', `--${name} is required`);
  return value;
}

// endregion | Helpers

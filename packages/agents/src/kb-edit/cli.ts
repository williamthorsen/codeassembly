/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { EditResult, OperationName, ParsedArgs } from './types.ts';

/** Operation flag → operation name. Order is the documented surface order in SKILL.md. */
const OPERATION_FLAGS = [
  { flag: '--bump-updated', name: 'bump-updated', takesValue: false },
  { flag: '--verify', name: 'verify', takesValue: false },
  { flag: '--append', name: 'append', takesValue: false },
  { flag: '--retag', name: 'retag', takesValue: true },
  { flag: '--supersede-with', name: 'supersede-with', takesValue: true },
] as const satisfies readonly { flag: string; name: OperationName; takesValue: boolean }[];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runEdit({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // The helper's contract is exit 0 with a structured `{ ok: false, ... }` for recoverable failures.
    // System failures (unexpected throws) take the catch arm below.
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-edit: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv.
 *
 * Layout: exactly one positional `<path>` plus exactly one operation flag. `--retag` and `--supersede-with` take an
 * inline or following value; `--bump-updated`, `--verify`, and `--append` are boolean. Multiple operation flags, an
 * unknown flag, a missing positional, or a missing required value throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanArgv(argv);
  return composeParsedArgs(scanned);
}

/**
 * Runs the helper end to end. Tasks 3-5 wire in the load/operation/write pipeline; the scaffolding currently
 * returns `invalid-args` for any parsed input so the structured contract is exercisable from day one. The `now`,
 * `stdin`, and `home` plumbing is in place so later tasks can connect operations without changing this signature.
 *
 * @internal - Exported to allow testing.
 */
export function runEdit(input: {
  argv: readonly string[];
  stdin: Readable;
  now: Date;
  home?: string;
}): Promise<EditResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return Promise.resolve({
      ok: false,
      error: 'invalid-args',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Suppress unused-variable warnings until Tasks 3-5 wire these in.
  void input.stdin;
  void input.now;
  void input.home;

  return Promise.resolve({
    ok: false,
    error: 'invalid-args',
    message: `operation "${args.operation}" is not yet implemented`,
  });
}

// region | Helpers

/** A captured operation flag: its canonical name plus the value (if any) that followed it. */
interface SelectedOp {
  name: OperationName;
  value: string | null;
}

/**
 * Walks `argv` once, separating the positional `<path>` from operation flags. Captures every operation flag seen
 * (length checks in `composeParsedArgs` reject zero or more-than-one), and rejects unknown flags, missing values for
 * value-bearing flags, and extra positional arguments. Returns the captured shape so the per-op composition can be
 * a separate, narrow function.
 */
function scanArgv(argv: readonly string[]): { positional: string | null; selectedOps: SelectedOp[] } {
  let positional: string | null = null;
  const selectedOps: SelectedOp[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg.startsWith('--')) {
      const matched = matchOperationFlag(arg);
      if (matched === null) {
        throw new Error(`unknown flag: ${arg}`);
      }
      let value: string | null = matched.inlineValue;
      if (matched.takesValue && value === null) {
        value = argv[index + 1] ?? null;
        index += 1;
      }
      if (matched.takesValue && (value === null || value === '' || value.startsWith('--'))) {
        throw new Error(`${matched.flag} requires a value`);
      }
      selectedOps.push({ name: matched.name, value });
      continue;
    }

    if (positional !== null) {
      throw new Error(`unexpected extra positional argument: ${arg}`);
    }
    positional = arg;
  }

  return { positional, selectedOps };
}

/**
 * Validates the scanned argv shape (one positional, exactly one operation flag) and projects it onto the typed
 * `ParsedArgs` union. Per-op value requirements (`--retag`, `--supersede-with`) are checked here too, so the loop
 * in `scanArgv` doesn't need to know which op is selected.
 */
function composeParsedArgs(input: { positional: string | null; selectedOps: SelectedOp[] }): ParsedArgs {
  const { positional, selectedOps } = input;

  if (positional === null) {
    throw new Error('missing required <path> positional argument');
  }
  if (selectedOps.length === 0) {
    const flags = OPERATION_FLAGS.map(({ flag }) => flag).join(', ');
    throw new Error(`one operation flag is required (one of: ${flags})`);
  }
  if (selectedOps.length > 1) {
    const seen = selectedOps.map(({ name }) => `--${name}`).join(', ');
    throw new Error(`operation flags are mutually exclusive; got ${seen}`);
  }

  const [op] = selectedOps;
  if (op === undefined) {
    // Unreachable: length checks above guarantee a single entry.
    throw new Error('internal error: missing operation after length checks');
  }

  switch (op.name) {
    case 'bump-updated':
    case 'verify':
    case 'append':
      return { operation: op.name, path: positional };
    case 'retag':
      if (op.value === null) {
        throw new Error('--retag requires a value');
      }
      return { operation: 'retag', path: positional, tags: parseTagList(op.value) };
    case 'supersede-with':
      if (op.value === null) {
        throw new Error('--supersede-with requires a value');
      }
      return { operation: 'supersede-with', path: positional, newPath: op.value };
    default: {
      const _exhaustive: never = op.name;
      throw new Error(`unhandled operation: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so a
 * symlinked invocation path still matches. On a `realpathSync` failure (broken symlink, permission denied) the
 * function emits a warning to stderr and returns `false`, matching the degrade-with-warning pattern kb-add uses.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-edit: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

/** Matches an operation flag, returning its name, whether it takes a value, and any inline `=value`. */
function matchOperationFlag(
  arg: string,
): { flag: string; name: OperationName; takesValue: boolean; inlineValue: string | null } | null {
  for (const entry of OPERATION_FLAGS) {
    if (arg === entry.flag) {
      return { ...entry, inlineValue: null };
    }
    if (entry.takesValue && arg.startsWith(`${entry.flag}=`)) {
      return { ...entry, inlineValue: arg.slice(`${entry.flag}=`.length) };
    }
  }
  return null;
}

/** Splits a comma-separated tag string into individual tags, dropping empties and trimming whitespace. */
function parseTagList(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

// endregion | Helpers

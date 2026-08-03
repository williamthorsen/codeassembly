/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@williamthorsen/kb';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { loadAliases } from '@williamthorsen/kb/tags';

import { splitCommaList } from '../kb-shared/note-helpers.ts';
import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';
import { resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { parseTagList } from '../kb-shared/tag-helpers.ts';
import { type FlagSpec, scanFlags } from '../lib/parse-flags.ts';
import { readAll } from '../lib/stream-helpers.ts';
import { commitSupersede } from './commit-supersede.ts';
import { loadNote } from './load-note.ts';
import { addAddressedBy } from './operations/add-addressed-by.ts';
import { append } from './operations/append.ts';
import { bumpUpdated } from './operations/bump-updated.ts';
import { retag } from './operations/retag.ts';
import { prepareSupersedeWith } from './operations/supersede-with.ts';
import { verify } from './operations/verify.ts';
import type {
  AddAddressedByResult,
  EditBatchSuccess,
  EditFailure,
  EditResult,
  EditSingleSuccess,
  EditSupersedeSuccess,
  OperationName,
  ParsedArgs,
} from './types.ts';
import { renderGuarded, writeBackNote } from './write-back.ts';

/** Operation flags, in the documented surface order in SKILL.md. Each name doubles as the operation name. */
const OPERATION_FLAGS = [
  { name: 'bump-updated', takesValue: false },
  { name: 'verify', takesValue: false },
  { name: 'append', takesValue: false },
  { name: 'retag', takesValue: true },
  { name: 'add-addressed-by', takesValue: true },
  { name: 'supersede-with', takesValue: true },
] as const satisfies readonly (FlagSpec & { name: OperationName })[];

/** Executes the helper from `process.argv` and writes the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runEdit({
      argv: process.argv.slice(2),
      stdin: process.stdin,
      startDir: process.cwd(),
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
 * Layout: one or more positional `<path>` arguments plus exactly one operation flag. `--add-addressed-by` is the
 * sole multi-target operation and accepts more than one path; every other operation accepts exactly one and rejects a
 * second positional. `--retag`, `--add-addressed-by`, and `--supersede-with` take an inline or following value;
 * `--bump-updated`, `--verify`, and `--append` are boolean. Multiple operation flags, an unknown flag, a missing
 * positional, or a missing required value throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanArgv(argv);
  return composeParsedArgs(scanned);
}

/**
 * Runs the helper end to end: parses args, resolves the writable KB that owns the note, loads the note as an
 * assertion record and the KB's tag aliases, dispatches to the operation module, and atomically writes the result
 * back. Recoverable failures (no KB, readonly KB, note not found, a note that does not parse as an assertion, op-side
 * rejections) become structured `{ ok: false, ... }` results. System failures (out-of-disk, EPERM) propagate to
 * `main`'s try/catch.
 *
 * @internal - Exported to allow testing.
 */
export async function runEdit(input: {
  argv: readonly string[];
  stdin: Readable;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditResult> {
  let args: ParsedArgs;
  try {
    args = parseArgs(input.argv);
  } catch (error) {
    return {
      ok: false,
      error: 'invalid-args',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (args.operation === 'supersede-with') {
    return runSupersedeWith({
      args,
      startDir: input.startDir,
      now: input.now,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  if (args.operation === 'add-addressed-by') {
    return runAddAddressedBy({
      args,
      startDir: input.startDir,
      now: input.now,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  const notePath = absoluteNotePath({ path: args.path, startDir: input.startDir });

  const kbOutcome = await resolveKbForPath({ notePath, ...(input.home !== undefined && { home: input.home }) });
  if (!kbOutcome.ok) {
    return kbOutcome.failure;
  }

  const loadOutcome = await loadNote({ path: notePath });
  if (!loadOutcome.ok) {
    return loadFailureToResult(loadOutcome);
  }

  const aliases = await loadAliasesForKb({ kb: kbOutcome.kb });

  const prepared = await prepareOperation({
    args,
    record: loadOutcome.record,
    aliases,
    now: input.now,
    stdin: input.stdin,
  });
  if (!prepared.ok) {
    return prepared.failure;
  }

  const writeOutcome = await writeBackNote({ path: notePath, record: prepared.record });
  if (!writeOutcome.ok) {
    return validationFailure(writeOutcome.errors);
  }

  const success: EditSingleSuccess = {
    ok: true,
    operation: args.operation,
    path: notePath,
    kb: kbOutcome.kb,
    record: prepared.record,
  };
  if (prepared.originalTags !== undefined) {
    success.originalTags = prepared.originalTags;
  }
  if (prepared.canonicalTags !== undefined) {
    success.canonicalTags = prepared.canonicalTags;
  }
  return success;
}

// region | Helpers

/** Resolves a possibly-relative note path against the caller's start directory. */
function absoluteNotePath(input: { path: string; startDir: string }): string {
  return isAbsolute(input.path) ? input.path : resolve(input.startDir, input.path);
}

/**
 * Resolves the writable KB that owns the note at `notePath`. Walks up from the note's directory, not the
 * caller's cwd, so the KB context tracks where the note lives rather than where the helper was invoked.
 * Maps resolver failures onto top-level `EditResult` failures.
 */
async function resolveKbForPath(input: {
  notePath: string;
  home?: string;
}): Promise<{ ok: true; kb: ResolvedKb } | { ok: false; failure: EditResult }> {
  const resolved = await resolveWritableKb({
    startDir: dirname(input.notePath),
    explicitKb: null,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (resolved.ok) {
    return { ok: true, kb: resolved.kb };
  }
  switch (resolved.reason) {
    // kb-edit never passes --kb, so a failed resolution always means the note's directory is not inside a writable
    // KB, which the resolver reports as `missing-destination`. The `no-kb-resolvable` (unmatched --kb name) and
    // `no-default` (--kb @default) reasons cannot arise here, but are mapped to the same failure so the switch stays
    // total against the shared resolver's outcome union.
    case 'missing-destination':
    case 'no-kb-resolvable':
    case 'no-default':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'no-kb-resolvable',
          message: `no .kb/ discovered for note at ${input.notePath}`,
        },
      };
    case 'readonly-kb':
      return {
        ok: false,
        failure: {
          ok: false,
          error: 'readonly-kb',
          message: `knowledge base "${resolved.kbName}" is marked readonly in kb.yaml; writes are refused`,
          details: { readonlyKbName: resolved.kbName, readonlyKbPath: resolved.kbPath },
        },
      };
    default: {
      const _exhaustive: never = resolved;
      throw new Error(`unhandled resolveWritableKb failure: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Builds the `KbRoot` descriptor for a resolved KB. */
function kbRootFor(kb: ResolvedKb): KbRoot {
  return { path: kb.path, kbDir: resolveKbDir(kb.path) };
}

/** Loads tag aliases for a resolved KB. Falls back to an empty alias map on a malformed aliases file. */
async function loadAliasesForKb(input: { kb: ResolvedKb }): Promise<AliasMap> {
  return loadAliasesWithWarning({ kbRoot: kbRootFor(input.kb) });
}

/**
 * Loads tag aliases, degrading a malformed or unreadable `tag-aliases.yaml` to an empty map and emitting a warning
 * to stderr so the operator can see why canonicalization was skipped.
 */
async function loadAliasesWithWarning(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: input.kbRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-edit: warning: could not load tag aliases: ${message}\n`);
    return new Map();
  }
}

/** Translates a `loadNote` failure outcome into a top-level `EditResult`. */
function loadFailureToResult(outcome: Exclude<Awaited<ReturnType<typeof loadNote>>, { ok: true }>): EditResult {
  if (outcome.reason === 'note-not-found') {
    return {
      ok: false,
      error: 'note-not-found',
      message: `no file at ${outcome.path}`,
      details: { missingPath: outcome.path },
    };
  }
  return {
    ok: false,
    error: 'note-parse',
    message: `could not parse frontmatter at ${outcome.path}: ${outcome.parseError}`,
    details: { parseError: outcome.parseError },
  };
}

/** Builds the top-level `validation` failure for a record whose rendered frontmatter did not re-parse as an assertion. */
function validationFailure(errors: string[]): EditFailure {
  return {
    ok: false,
    error: 'validation',
    message: `rendered frontmatter did not re-parse as an assertion: ${errors.join('; ')}`,
    details: { errors },
  };
}

/** Shape returned by `prepareOperation`: a mutated record plus optional per-op metadata. */
interface PreparedOperation {
  ok: true;
  record: KbAssertion;
  originalTags?: string[];
  canonicalTags?: string[];
}

/** Dispatches an operation to its module and returns the prepared record, or a top-level failure. */
async function prepareOperation(input: {
  args: Exclude<ParsedArgs, { operation: 'supersede-with' | 'add-addressed-by' }>;
  record: KbAssertion;
  aliases: AliasMap;
  now: Date;
  stdin: Readable;
}): Promise<PreparedOperation | { ok: false; failure: EditResult }> {
  const { record } = input;

  switch (input.args.operation) {
    case 'bump-updated':
      return { ok: true, record: bumpUpdated(record, input.now) };
    case 'verify':
      return { ok: true, record: verify(record, input.now) };
    case 'retag': {
      const result = retag(record, input.args.tags, input.aliases);
      return {
        ok: true,
        record: result.record,
        originalTags: result.originalTags,
        canonicalTags: result.canonicalTags,
      };
    }
    case 'append': {
      const addition = await readAll(input.stdin);
      const result = append(record, addition, input.now);
      if (!result.ok) {
        return { ok: false, failure: { ok: false, error: 'invalid-args', message: result.message } };
      }
      return { ok: true, record: result.record };
    }
    default: {
      const _exhaustive: never = input.args;
      throw new Error(`unhandled operation: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Orchestrates `--supersede-with`: resolves and validates both paths into the same KB, prepares the in-memory
 * edits, re-parses both rendered records as a guard, then commits both writes with best-effort
 * atomicity. On the second rename's failure, the captured original bytes of the old note are restored. If
 * restoration also fails, the result surfaces as `partial-supersede` with both paths in `details`.
 */
async function runSupersedeWith(input: {
  args: Extract<ParsedArgs, { operation: 'supersede-with' }>;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditResult> {
  const oldPath = absoluteNotePath({ path: input.args.path, startDir: input.startDir });
  const newPath = absoluteNotePath({ path: input.args.newPath, startDir: input.startDir });

  if (oldPath === newPath) {
    return {
      ok: false,
      error: 'invalid-args',
      message: `supersede chain requires distinct paths; got the same path for old and new: ${oldPath}`,
    };
  }

  const oldKb = await resolveKbForPath({ notePath: oldPath, ...(input.home !== undefined && { home: input.home }) });
  if (!oldKb.ok) {
    return oldKb.failure;
  }
  const newKb = await resolveKbForPath({ notePath: newPath, ...(input.home !== undefined && { home: input.home }) });
  if (!newKb.ok) {
    return newKb.failure;
  }
  if (oldKb.kb.path !== newKb.kb.path) {
    return {
      ok: false,
      error: 'invalid-args',
      message: `supersede chain requires both notes in the same KB; old is in ${oldKb.kb.path}, new is in ${newKb.kb.path}`,
    };
  }

  const oldLoad = await loadNote({ path: oldPath });
  if (!oldLoad.ok) {
    return loadFailureToResult(oldLoad);
  }
  const newLoad = await loadNote({ path: newPath });
  if (!newLoad.ok) {
    if (newLoad.reason === 'note-not-found') {
      return {
        ok: false,
        error: 'supersede-target-missing',
        message: `--supersede-with target does not exist: ${newPath}`,
        details: { missingPath: newPath },
      };
    }
    return loadFailureToResult(newLoad);
  }

  const aliases = await loadAliasesForKb({ kb: oldKb.kb });

  const prepared = prepareSupersedeWith({
    oldRecord: oldLoad.record,
    oldPath,
    newRecord: newLoad.record,
    newPath,
    kbPath: oldKb.kb.path,
    aliases,
    now: input.now,
  });

  const oldRendered = renderGuarded(prepared.old);
  const newRendered = renderGuarded(prepared.new);
  if (!oldRendered.ok || !newRendered.ok) {
    const errors = [...(oldRendered.ok ? [] : oldRendered.errors), ...(newRendered.ok ? [] : newRendered.errors)];
    return validationFailure(errors);
  }

  const commitOutcome = await commitSupersede({
    oldPath,
    newPath,
    oldOriginalContent: oldLoad.content,
    oldNewContent: oldRendered.content,
    newNewContent: newRendered.content,
  });
  if (!commitOutcome.ok) {
    return {
      ok: false,
      error: 'partial-supersede',
      message: `supersede-with: failed to commit and could not roll back; both notes may be in an inconsistent state. Original error: ${commitOutcome.message}`,
      details: { oldPath, newPath },
    };
  }

  const success: EditSupersedeSuccess = {
    ok: true,
    operation: 'supersede-with',
    oldPath,
    newPath,
    kb: oldKb.kb,
    oldRecord: prepared.old,
    newRecord: prepared.new,
  };
  return success;
}

/**
 * Orchestrates `--add-addressed-by`: applies the same reference list to each target record independently. Every target
 * resolves its own writable KB, loads, appends to `addressed-by`, and writes atomically; a recoverable failure on one
 * target is captured in that record's result and does not abort the others. Per-record isolation covers the
 * recoverable `EditResult` failures only: an unexpected throw (a filesystem error) still propagates to `main`, as it
 * does for the single-file operations. The append de-duplicates, so a re-run is
 * idempotent for `addressed-by` (entries are never duplicated) even though each run re-bumps `updated:`; no cross-file
 * rollback is needed.
 */
async function runAddAddressedBy(input: {
  args: Extract<ParsedArgs, { operation: 'add-addressed-by' }>;
  startDir: string;
  now: Date;
  home?: string;
}): Promise<EditBatchSuccess> {
  const results: AddAddressedByResult[] = [];
  for (const rawPath of input.args.paths) {
    const notePath = absoluteNotePath({ path: rawPath, startDir: input.startDir });
    results.push(
      await editOneAddressedBy({
        notePath,
        references: input.args.references,
        now: input.now,
        ...(input.home !== undefined && { home: input.home }),
      }),
    );
  }
  return { ok: true, operation: 'add-addressed-by', results };
}

/** Applies the addressed-by append to a single target, mapping any recoverable failure onto a per-record result. */
async function editOneAddressedBy(input: {
  notePath: string;
  references: readonly string[];
  now: Date;
  home?: string;
}): Promise<AddAddressedByResult> {
  const kbOutcome = await resolveKbForPath({
    notePath: input.notePath,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!kbOutcome.ok) {
    return toRecordFailure(input.notePath, kbOutcome.failure);
  }

  const loadOutcome = await loadNote({ path: input.notePath });
  if (!loadOutcome.ok) {
    return toRecordFailure(input.notePath, loadFailureToResult(loadOutcome));
  }

  const prepared = addAddressedBy(loadOutcome.record, input.references, input.now);

  const writeOutcome = await writeBackNote({ path: input.notePath, record: prepared });
  if (!writeOutcome.ok) {
    return toRecordFailure(input.notePath, validationFailure(writeOutcome.errors));
  }

  return { ok: true, path: input.notePath, kb: kbOutcome.kb, record: prepared };
}

/** Projects a top-level recoverable `EditFailure` onto a per-record failure entry, attaching the record's path. */
function toRecordFailure(path: string, failure: EditResult): Extract<AddAddressedByResult, { ok: false }> {
  if (failure.ok) {
    // Unreachable: the helpers feeding this only return failures here.
    throw new Error(`internal error: expected a failure result for ${path}`);
  }
  return {
    ok: false,
    path,
    error: failure.error,
    message: failure.message,
    ...(failure.details !== undefined && { details: failure.details }),
  };
}

/** A captured operation flag: its canonical name plus the value (if any) that followed it. */
interface SelectedOp {
  name: OperationName;
  value: string | null;
}

/**
 * Walks `argv` once, separating positional `<path>` arguments from operation flags. Captures every positional and
 * every operation flag seen; arity (zero or more-than-one of each, and which operations accept multiple positionals)
 * is enforced in `composeParsedArgs`. Rejects unknown flags and missing values for value-bearing flags. Returns the
 * captured shape so the per-op composition can be a separate, narrow function.
 */
function scanArgv(argv: readonly string[]): { positionals: string[]; selectedOps: SelectedOp[] } {
  // The specs are typed with the OperationName union, so the kernel reports each matched flag under that union. A
  // boolean op carries a `null` value; a value op carries its resolved (possibly empty) string. Empty inline values
  // are intentionally allowed at this layer — each op decides whether empty is meaningful (`--retag=` clears tags) or
  // downstream-rejected (`--supersede-with=` fails path resolution, `--add-addressed-by=` yields no references).
  const { positionals, flags } = scanFlags(argv, OPERATION_FLAGS);
  const selectedOps: SelectedOp[] = flags.map((flag) => ({ name: flag.name, value: flag.value }));
  return { positionals, selectedOps };
}

/**
 * Validates the scanned argv shape (at least one positional, exactly one operation flag) and projects it onto the
 * typed `ParsedArgs` union. Per-op value requirements (`--retag`, `--add-addressed-by`, `--supersede-with`) and
 * positional arity (single-target ops reject a second path; `--add-addressed-by` accepts many) are checked here, so
 * the loop in `scanArgv` doesn't need to know which op is selected.
 */
function composeParsedArgs(input: { positionals: string[]; selectedOps: SelectedOp[] }): ParsedArgs {
  const { positionals, selectedOps } = input;

  if (positionals.length === 0) {
    throw new Error('missing required <path> positional argument');
  }
  if (selectedOps.length === 0) {
    const flags = OPERATION_FLAGS.map((spec) => `--${spec.name}`).join(', ');
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
      return { operation: op.name, path: singlePositional(positionals) };
    case 'retag':
      if (op.value === null) {
        throw new Error('--retag requires a value');
      }
      return { operation: 'retag', path: singlePositional(positionals), tags: parseTagList(op.value) };
    case 'add-addressed-by': {
      if (op.value === null) {
        throw new Error('--add-addressed-by requires a value');
      }
      const references = splitCommaList(op.value);
      if (references.length === 0) {
        throw new Error('--add-addressed-by requires at least one reference');
      }
      return { operation: 'add-addressed-by', paths: positionals, references };
    }
    case 'supersede-with':
      // Empty `--supersede-with` value is rejected here so it surfaces as a clear `invalid-args`, not a confusing
      // EISDIR downstream when `''` resolves to the start directory.
      if (op.value === null || op.value === '') {
        throw new Error('--supersede-with requires a value');
      }
      return { operation: 'supersede-with', path: singlePositional(positionals), newPath: op.value };
    default: {
      const _exhaustive: never = op.name;
      throw new Error(`unhandled operation: ${String(_exhaustive)}`);
    }
  }
}

/** Returns the sole positional path for a single-target operation, rejecting a second one with a usage error. */
function singlePositional(positionals: string[]): string {
  const [first, second] = positionals;
  if (second !== undefined) {
    throw new Error(`unexpected extra positional argument: ${second}`);
  }
  if (first === undefined) {
    // Unreachable: the caller's length check guarantees at least one positional.
    throw new Error('missing required <path> positional argument');
  }
  return first;
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

// endregion | Helpers

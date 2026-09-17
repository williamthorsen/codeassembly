/* eslint n/no-process-exit: off -- CLI entry point: the helper's resolved exit code must reach the OS, and `main` runs only behind the `isEntryPoint()` guard, never on import as a library. */
/* eslint unicorn/no-process-exit: off -- same as above. */
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, KbRoot } from '@williamthorsen/kb';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { loadAliases } from '@williamthorsen/kb/tags';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { splitCommaList } from '../kb-shared/note-helpers.ts';
import { type ResolvedKb, resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
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

/** Operation flags, in the surface order that SKILL.md documents. */
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
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-edit: ${message}\n`);
    process.exit(1);
  }
}

if (isEntryPoint()) {
  await main();
}

/**
 * Parses the helper's argv: one or more positional `<path>` arguments plus exactly one operation flag. Throws on any
 * defect in it, and `runEdit` turns the throw into an `invalid-args` result.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const scanned = scanArgv(argv);
  return composeParsedArgs(scanned);
}

/**
 * Runs the helper end to end, from argv to the note written back.
 *
 * A recoverable failure returns a structured `{ ok: false, ... }` result; a system failure propagates to `main`.
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
      message: describeError(error),
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
 * Resolves the writable KB that owns the note at `notePath`. The walk starts at the note's directory, so the KB
 * context tracks where the note lives rather than where the helper was invoked.
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
    // kb-edit never passes --kb, so the only reason that can arise here is `missing-destination`. The other two are
    // mapped alongside it, which keeps the switch total against the shared resolver's outcome union.
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

/** Loads tag aliases for a resolved KB. */
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
    const message = describeError(error);
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
 * Orchestrates `--supersede-with`: validates that both paths name notes in the same KB, then commits both writes
 * through `commitSupersede`.
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
 * Orchestrates `--add-addressed-by`: applies the same reference list to each target independently, so a recoverable
 * failure on one target becomes that record's result and the rest of the batch still runs. An unexpected throw
 * propagates to `main`.
 *
 * The operation adds no duplicate reference, so the batch needs no cross-file rollback.
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
 * Separates positional `<path>` arguments from operation flags, capturing every one of each. `composeParsedArgs`
 * enforces arity.
 */
function scanArgv(argv: readonly string[]): { positionals: string[]; selectedOps: SelectedOp[] } {
  // An empty inline value passes through, because each operation decides for itself whether empty is meaningful.
  const { positionals, flags } = scanFlags(argv, OPERATION_FLAGS);
  const selectedOps: SelectedOp[] = flags.map((flag) => ({ name: flag.name, value: flag.value }));
  return { positionals, selectedOps };
}

/**
 * Validates the scanned argv shape and projects it onto the typed `ParsedArgs` union, including every per-operation
 * requirement: the value that a flag needs, and the number of positionals that it accepts.
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
 * symlinked invocation path still matches. A `realpathSync` failure warns on stderr and returns `false`.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = describeError(error);
    process.stderr.write(`kb-edit: warning: could not determine entry point: ${message}\n`);
    return false;
  }
}

// endregion | Helpers

/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { randomBytes } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { AliasMap, Finding, Frontmatter, KbRoot, ParsedNote, Schema } from '@codeassembly/kb-core';
import { parseNoteContent, writeFrontmatter } from '@codeassembly/kb-core/frontmatter';
import { frontmatterRule, runRules } from '@codeassembly/kb-core/rules';
import { loadSchema } from '@codeassembly/kb-core/schema';
import { loadAliases } from '@codeassembly/kb-core/tags';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';
import { resolveWritableKb } from '../kb-shared/resolve-writable-kb.ts';
import { loadNote } from './load-note.ts';
import { append } from './operations/append.ts';
import { bumpUpdated } from './operations/bump-updated.ts';
import { retag } from './operations/retag.ts';
import { prepareSupersedeWith } from './operations/supersede-with.ts';
import { verify } from './operations/verify.ts';
import type { EditResult, EditSingleSuccess, EditSupersedeSuccess, OperationName, ParsedArgs } from './types.ts';
import { writeBackNote } from './write-back.ts';

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
 * Runs the helper end to end: parses args, resolves the writable KB that owns the note, loads the note and the
 * KB's schema/aliases, dispatches to the operation module, and atomically writes the result back. Recoverable
 * failures (no KB, readonly KB, note not found, note parse error, schema validation, op-side rejections) become
 * structured `{ ok: false, ... }` results. System failures (out-of-disk, EPERM) propagate to `main`'s try/catch.
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

  const notePath = absoluteNotePath({ path: args.path, startDir: input.startDir });

  const kbOutcome = await resolveKbForPath({ notePath, ...(input.home !== undefined && { home: input.home }) });
  if (!kbOutcome.ok) {
    return kbOutcome.failure;
  }

  const loadOutcome = await loadNote({ path: notePath });
  if (!loadOutcome.ok) {
    return loadFailureToResult(loadOutcome);
  }

  const { schema, aliases } = await loadKbContext({ kb: kbOutcome.kb });

  const prepared = await prepareOperation({
    args,
    note: loadOutcome.note,
    aliases,
    now: input.now,
    stdin: input.stdin,
  });
  if (!prepared.ok) {
    return prepared.failure;
  }

  const writeOutcome = await writeBackNote({
    path: notePath,
    frontmatter: prepared.frontmatter,
    body: prepared.body,
    schema,
  });
  if (!writeOutcome.ok) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `frontmatter did not pass schema validation: ${writeOutcome.findings.map((f) => f.message).join('; ')}`,
      details: { findings: writeOutcome.findings },
    };
  }

  const success: EditSingleSuccess = {
    ok: true,
    operation: args.operation,
    path: notePath,
    kb: kbOutcome.kb,
    frontmatter: prepared.frontmatter,
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
 * Maps resolver failures (`no-kb-resolvable`, `readonly-kb`) onto top-level `EditResult` failures.
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
    case 'no-kb-resolvable':
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

/** Loads schema and aliases for a resolved KB. Falls back to an empty alias map on a malformed aliases file. */
async function loadKbContext(input: { kb: ResolvedKb }): Promise<{ schema: Schema; aliases: AliasMap }> {
  const kbRoot: KbRoot = { path: input.kb.path, kbDir: `${input.kb.path}/.kb`, via: 'ancestor-walk' };
  const [schema, aliases] = await Promise.all([loadSchema({ kbRoot }), loadAliasesWithWarning({ kbRoot })]);
  return { schema, aliases };
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

/** Shape returned by `prepareOperation`: a mutated frontmatter+body plus optional per-op metadata. */
interface PreparedOperation {
  ok: true;
  frontmatter: Frontmatter;
  body: string;
  originalTags?: string[];
  canonicalTags?: string[];
}

/** Dispatches an operation to its module and returns the prepared write payload, or a top-level failure. */
async function prepareOperation(input: {
  args: Exclude<ParsedArgs, { operation: 'supersede-with' }>;
  note: ParsedNote;
  aliases: AliasMap;
  now: Date;
  stdin: Readable;
}): Promise<PreparedOperation | { ok: false; failure: EditResult }> {
  const frontmatter = nonNullFrontmatter(input.note);
  const body = input.note.body;

  switch (input.args.operation) {
    case 'bump-updated': {
      const result = bumpUpdated({ frontmatter, body, now: input.now });
      return { ok: true, ...result };
    }
    case 'verify': {
      const result = verify({ frontmatter, body, now: input.now });
      return { ok: true, ...result };
    }
    case 'retag': {
      const result = retag({ frontmatter, body, tags: input.args.tags, aliases: input.aliases, now: input.now });
      return { ok: true, ...result };
    }
    case 'append': {
      const addition = await readAll(input.stdin);
      const result = append({ frontmatter, body, addition, now: input.now });
      if (!result.ok) {
        return { ok: false, failure: { ok: false, error: 'invalid-args', message: result.message } };
      }
      return { ok: true, frontmatter: result.frontmatter, body: result.body };
    }
    default: {
      const _exhaustive: never = input.args;
      throw new Error(`unhandled operation: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Pulls the typed frontmatter off a loaded note; loadNote guarantees it is non-null at this point. */
function nonNullFrontmatter(note: ParsedNote): Frontmatter {
  if (note.frontmatter === null) {
    throw new Error(`internal error: note at ${note.path} unexpectedly has null frontmatter after loadNote`);
  }
  return note.frontmatter;
}

/**
 * Orchestrates `--supersede-with`: resolves and validates both paths into the same KB, prepares the in-memory
 * edits, validates both resulting frontmatters against the schema, then commits both writes with best-effort
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

  const { schema, aliases } = await loadKbContext({ kb: oldKb.kb });

  const prepared = prepareSupersedeWith({
    oldNote: oldLoad.note,
    oldFrontmatter: nonNullFrontmatter(oldLoad.note),
    newNote: newLoad.note,
    newFrontmatter: nonNullFrontmatter(newLoad.note),
    kbPath: oldKb.kb.path,
    aliases,
    now: input.now,
  });

  const oldRendered = writeFrontmatter({ frontmatter: prepared.old.frontmatter, body: prepared.old.body });
  const newRendered = writeFrontmatter({ frontmatter: prepared.new.frontmatter, body: prepared.new.body });

  const oldFindings = validateRendered({ content: oldRendered, path: oldPath, schema });
  const newFindings = validateRendered({ content: newRendered, path: newPath, schema });
  const allFindings = [...oldFindings, ...newFindings];
  if (allFindings.length > 0) {
    return {
      ok: false,
      error: 'schema-validation',
      message: `frontmatter did not pass schema validation: ${allFindings.map((f) => f.message).join('; ')}`,
      details: { findings: allFindings },
    };
  }

  const commitOutcome = await commitSupersede({
    oldPath,
    newPath,
    oldOriginalContent: oldLoad.note.content,
    oldNewContent: oldRendered,
    newNewContent: newRendered,
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
    oldFrontmatter: prepared.old.frontmatter,
    newFrontmatter: prepared.new.frontmatter,
  };
  return success;
}

/**
 * Renders a frontmatter+body string and runs the frontmatter rule against it, returning error-severity findings.
 * Mirrors the validation inside `writeBackNote` but runs detached from the write so two notes can be validated
 * before either rename happens.
 */
function validateRendered(input: { content: string; path: string; schema: Schema }): Finding[] {
  const parsed = parseNoteContent({ content: input.content, path: input.path });
  return runRules({ rules: [frontmatterRule], notes: [parsed], schema: input.schema }).filter(
    (finding) => finding.severity === 'error',
  );
}

/**
 * Commits two pre-validated note writes with best-effort atomicity.
 *
 * Sequence:
 *  1. Write both temp files (no destination mutated yet).
 *  2. Rename temp-old → oldPath. On failure, cleanup both temps and re-throw.
 *  3. Rename temp-new → newPath. On failure: write the captured original bytes to a new temp and rename it onto
 *     oldPath to undo step 2. If the rollback fails, return `{ ok: false }` so the caller can surface
 *     `partial-supersede`.
 *
 * System errors during step 1 or step 2's failure-handling propagate (caller's main catch).
 */
async function commitSupersede(input: {
  oldPath: string;
  newPath: string;
  oldOriginalContent: string;
  oldNewContent: string;
  newNewContent: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const oldTmp = `${input.oldPath}.${randomBytes(8).toString('hex')}.tmp`;
  const newTmp = `${input.newPath}.${randomBytes(8).toString('hex')}.tmp`;

  await writeFile(oldTmp, input.oldNewContent, 'utf8');
  try {
    await writeFile(newTmp, input.newNewContent, 'utf8');
  } catch (error) {
    await unlink(oldTmp).catch(() => {});
    throw error;
  }

  try {
    await rename(oldTmp, input.oldPath);
  } catch (error) {
    await unlink(oldTmp).catch(() => {});
    await unlink(newTmp).catch(() => {});
    throw error;
  }

  try {
    await rename(newTmp, input.newPath);
    return { ok: true };
  } catch (renameError) {
    await unlink(newTmp).catch(() => {});
    const originalMessage = renameError instanceof Error ? renameError.message : String(renameError);
    const rollback = await tryRollbackOld({ oldPath: input.oldPath, originalContent: input.oldOriginalContent });
    if (rollback.ok) {
      // Rollback succeeded: the world is consistent again. Re-throw so the failure surfaces as a system error.
      throw renameError;
    }
    return { ok: false, message: originalMessage };
  }
}

/** Restores the captured original bytes to `oldPath` via temp + rename. Returns ok on success. */
async function tryRollbackOld(input: { oldPath: string; originalContent: string }): Promise<{ ok: boolean }> {
  const rollbackTmp = `${input.oldPath}.${randomBytes(8).toString('hex')}.rollback.tmp`;
  try {
    await writeFile(rollbackTmp, input.originalContent, 'utf8');
    await rename(rollbackTmp, input.oldPath);
    return { ok: true };
  } catch {
    await unlink(rollbackTmp).catch(() => {});
    return { ok: false };
  }
}

/** Reads a readable stream to completion as a UTF-8 string. */
async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError('readAll: expected Buffer chunks (stream must be in binary mode)');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

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

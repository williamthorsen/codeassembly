import { mkdir } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { pathExists } from '@codeassembly/kb/filesystem';
import { ASSERTIONS_DIR, ASSERTIONS_SEGMENT, resolveAssertionsDir } from '@codeassembly/kb/layout';
import { writeNote as writeNoteAtomic } from '@codeassembly/kb/note-io';
import { type KbAssertion, renderAssertion } from '@codeassembly/kb/records';

/** Successful write: the absolute path the note landed at. */
export interface WriteSuccess {
  ok: true;
  path: string;
}

/** Categorical write failures the helper surfaces as structured results. */
export type WriteFailure =
  | { ok: false; reason: 'invalid-title'; message: string }
  | { ok: false; reason: 'invalid-folder'; message: string }
  | { ok: false; reason: 'collision'; existingPath: string };

/** The outcome of attempting to write a prepared note. */
export type WriteOutcome = WriteSuccess | WriteFailure;

/**
 * Writes a prepared assertion to disk under the KB's assertions root (`content/assertions/`), choosing the path from
 * that root + folder + (title-verbatim + `.md`). `folder` is the topic subpath beneath the archetype root, not the
 * archetype itself: `kb-add` owns the `assertions/` segment, mirroring the hardcoded `recordType: assertion`.
 *
 * Title-as-filename is intentional. Titles containing path separators, null bytes, or newlines are rejected explicitly
 * rather than silently sanitized so the agent can decide whether to re-title or abort. Leading and trailing whitespace
 * is trimmed first; an empty result after trimming is also rejected.
 *
 * Two structured refusals keep a malformed `folder` from misplacing a note rather than silently succeeding: a `folder`
 * that climbs out of the assertions root (`invalid-folder`), and a `folder` that re-names the `assertions/` archetype
 * segment (`invalid-folder`).
 *
 * The target folder is created with `mkdir -p` semantics when absent. On filename collision the function returns a
 * structured error without modifying anything on disk. Otherwise the note is rendered and written atomically via a
 * same-directory temp file plus `rename`, so a process kill mid-write cannot leave a partial file at the destination.
 *
 * The collision check is not atomic with the subsequent rename: a second invocation that completes between the
 * `pathExists` probe and the final rename will be silently overwritten. Single-user CLI use is safe; concurrent
 * invocations against the same KB must be serialized by the caller.
 */
export async function writeNote(input: {
  kbPath: string;
  folder: string | null;
  title: string;
  record: KbAssertion;
}): Promise<WriteOutcome> {
  const filenameOutcome = composeFilename(input.title);
  if (!filenameOutcome.ok) {
    return filenameOutcome;
  }

  const assertionsRoot = resolveAssertionsDir(input.kbPath);
  const targetDir = input.folder === null ? assertionsRoot : join(assertionsRoot, input.folder);
  if (!isWithin({ root: assertionsRoot, target: targetDir })) {
    return {
      ok: false,
      reason: 'invalid-folder',
      message: `folder "${input.folder ?? ''}" resolves outside the assertions root`,
    };
  }
  if (namesArchetypeSegment({ assertionsRoot, targetDir })) {
    return {
      ok: false,
      reason: 'invalid-folder',
      message: `folder "${input.folder ?? ''}" must not begin with "${ASSERTIONS_SEGMENT}/"; kb-add writes under ${ASSERTIONS_DIR}/ automatically — pass the topic subpath only`,
    };
  }

  const targetPath = join(targetDir, filenameOutcome.filename);

  if (await pathExists(targetPath)) {
    return { ok: false, reason: 'collision', existingPath: targetPath };
  }

  await mkdir(targetDir, { recursive: true });

  const { fields, body } = renderAssertion(input.record);
  await writeNoteAtomic(targetPath, fields, body);

  return { ok: true, path: targetPath };
}

/**
 * Composes a filename from a title, returning a structured failure on a title that cannot be used as a path segment.
 *
 * Exported for direct unit testing of the title-rejection edge cases.
 */
export function composeFilename(
  title: string,
): { ok: true; filename: string } | { ok: false; reason: 'invalid-title'; message: string } {
  const trimmed = title.trim();
  if (trimmed === '') {
    return { ok: false, reason: 'invalid-title', message: 'title is empty after trimming whitespace' };
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return { ok: false, reason: 'invalid-title', message: 'title cannot contain path separators' };
  }
  if (trimmed.includes('\0')) {
    return { ok: false, reason: 'invalid-title', message: 'title cannot contain null bytes' };
  }
  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return { ok: false, reason: 'invalid-title', message: 'title cannot contain newlines' };
  }
  // `composeFilename` appends `.md`, so a `.` title becomes `.md` and `..` becomes `..md`. Those are hidden-file
  // names that an agent cannot have meant to choose — and on case-insensitive filesystems they collide with
  // existing dotfiles. Reject so the title-to-filename mapping stays predictable.
  if (trimmed === '.' || trimmed === '..') {
    return { ok: false, reason: 'invalid-title', message: `title cannot be "${trimmed}"` };
  }
  return { ok: true, filename: `${trimmed}.md` };
}

// region | Helpers

/**
 * Returns true when `target` resolves to a location inside `root` (or to `root` itself). Compares lexically resolved
 * paths so `..` segments are caught before any directory is created or any file is written. Symlinks are not resolved
 * here: a symlink that points outside `root` would not be caught. For single-user CLI use, planting such a symlink
 * requires pre-existing write access, so the lexical check is sufficient. Multi-tenant use would need a `realpath`
 * walk against the deepest existing ancestor.
 */
function isWithin(input: { root: string; target: string }): boolean {
  const resolvedRoot = resolve(input.root);
  const resolvedTarget = resolve(input.target);
  if (resolvedTarget === resolvedRoot) {
    return true;
  }
  return resolvedTarget.startsWith(resolvedRoot + sep);
}

/**
 * Reports whether `targetDir`'s first segment beneath the assertions root re-names the archetype directory
 * (`content/assertions/assertions/...`). Catches a caller that prefixed the archetype into `--folder` out of habit;
 * `kb-add` owns that segment, so the caller passes the topic subpath only.
 */
function namesArchetypeSegment(input: { assertionsRoot: string; targetDir: string }): boolean {
  return relative(input.assertionsRoot, input.targetDir).split(sep)[0] === ASSERTIONS_SEGMENT;
}

// endregion | Helpers

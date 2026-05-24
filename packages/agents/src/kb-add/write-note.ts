import { randomBytes } from 'node:crypto';
import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import type { Frontmatter } from '@codeassembly/kb-core';
import { writeFrontmatter } from '@codeassembly/kb-core/frontmatter';

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
 * Writes a prepared note to disk, choosing the path from KB root + folder + (title-verbatim + `.md`).
 *
 * Title-as-filename is intentional. Titles containing path separators, null bytes, or newlines are rejected explicitly
 * rather than silently sanitized so the agent can decide whether to re-title or abort. Leading and trailing whitespace
 * is trimmed first; an empty result after trimming is also rejected.
 *
 * The target folder is created with `mkdir -p` semantics when absent. On filename collision the function returns a
 * structured error without modifying anything on disk. Otherwise the note is written atomically via a same-directory
 * temp file plus `rename`, so a process kill mid-write cannot leave a partial file at the destination path.
 */
export async function writeNote(input: {
  kbPath: string;
  folder: string | null;
  title: string;
  frontmatter: Frontmatter;
  body: string;
}): Promise<WriteOutcome> {
  const filenameOutcome = composeFilename(input.title);
  if (!filenameOutcome.ok) {
    return filenameOutcome;
  }

  const targetDir = input.folder === null ? input.kbPath : join(input.kbPath, input.folder);
  if (!isWithinKb({ kbPath: input.kbPath, targetDir })) {
    return {
      ok: false,
      reason: 'invalid-folder',
      message: `folder "${input.folder ?? ''}" resolves outside the KB root`,
    };
  }
  const targetPath = join(targetDir, filenameOutcome.filename);

  if (await pathExists(targetPath)) {
    return { ok: false, reason: 'collision', existingPath: targetPath };
  }

  await mkdir(targetDir, { recursive: true });

  const content = writeFrontmatter({ frontmatter: input.frontmatter, body: input.body });
  await atomicWrite({ targetPath, content });

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
 * Atomic write via same-directory temp file plus rename. The temp filename uses a random suffix so concurrent writes
 * to nearby paths cannot collide. A failed rename triggers a best-effort temp-file cleanup, then re-throws so a
 * permission or disk error surfaces unambiguously.
 */
async function atomicWrite(input: { targetPath: string; content: string }): Promise<void> {
  const tempPath = `${input.targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await rename(tempPath, input.targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

/**
 * Returns true when a file or directory exists at the path. ENOENT is the only "not found" signal — any other
 * `stat` error (permission denied, I/O error, etc.) is re-thrown so the caller sees the real failure rather
 * than a false "no collision, safe to write" answer.
 */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }
}

/** Returns true when `error` is a Node ENOENT filesystem error. */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Returns true when `targetDir` resolves to a location inside the KB root (or to the root itself).
 * Compares fully resolved paths so `..` segments or symlink-style escapes are caught before any directory is
 * created or any file is written.
 */
function isWithinKb(input: { kbPath: string; targetDir: string }): boolean {
  const resolvedRoot = resolve(input.kbPath);
  const resolvedTarget = resolve(input.targetDir);
  if (resolvedTarget === resolvedRoot) {
    return true;
  }
  return resolvedTarget.startsWith(resolvedRoot + sep);
}

// endregion | Helpers

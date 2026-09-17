import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * The subset of `node:fs/promises` operations that `commitSupersede` performs. A test injects a mock through it to
 * exercise the rollback paths, which depend on specific renames failing.
 */
export interface CommitSupersedeIo {
  writeFile: typeof writeFile;
  rename: typeof rename;
  unlink: typeof unlink;
}

const REAL_IO: CommitSupersedeIo = { writeFile, rename, unlink };

/** Successful commit: Both renames succeeded. */
export interface CommitSuccess {
  ok: true;
}

/**
 * Commit aborted and the rollback also failed: The old note contains either its edited content or a partial rollback,
 * and the new note is unchanged.
 */
export interface CommitFailure {
  ok: false;
  message: string;
}

export type CommitOutcome = CommitSuccess | CommitFailure;

/**
 * Commits two pre-validated note writes with best-effort atomicity: stages each write in a temp file, and restores the
 * old note's captured original bytes when the second rename fails.
 *
 * The function throws on every failure, which keeps a rename failure uniform with any other I/O failure. The one
 * exception is a rollback that itself fails: In that case the function returns `{ ok: false }`, because the two notes
 * are then inconsistent and only the caller can report that.
 */
export async function commitSupersede(input: {
  oldPath: string;
  newPath: string;
  oldOriginalContent: string;
  oldNewContent: string;
  newNewContent: string;
  io?: CommitSupersedeIo;
}): Promise<CommitOutcome> {
  const io = input.io ?? REAL_IO;
  const oldTmp = `${input.oldPath}.${randomBytes(8).toString('hex')}.tmp`;
  const newTmp = `${input.newPath}.${randomBytes(8).toString('hex')}.tmp`;

  await io.writeFile(oldTmp, input.oldNewContent, 'utf8');
  try {
    await io.writeFile(newTmp, input.newNewContent, 'utf8');
  } catch (error) {
    await unlinkQuietly(io, oldTmp);
    throw error;
  }

  try {
    await io.rename(oldTmp, input.oldPath);
  } catch (error) {
    await unlinkQuietly(io, oldTmp);
    await unlinkQuietly(io, newTmp);
    throw error;
  }

  try {
    await io.rename(newTmp, input.newPath);
    return { ok: true };
  } catch (renameError) {
    await unlinkQuietly(io, newTmp);
    const originalMessage = describeError(renameError);
    const rollback = await tryRollbackOld({
      oldPath: input.oldPath,
      originalContent: input.oldOriginalContent,
      io,
    });
    if (rollback.ok) {
      // The old note is back to its original bytes, so this is an ordinary I/O failure.
      throw renameError;
    }
    return { ok: false, message: originalMessage };
  }
}

// region | Helpers

/** Restores the captured original bytes to `oldPath` via temp + rename. */
async function tryRollbackOld(input: {
  oldPath: string;
  originalContent: string;
  io: CommitSupersedeIo;
}): Promise<{ ok: boolean }> {
  const rollbackTmp = `${input.oldPath}.${randomBytes(8).toString('hex')}.rollback.tmp`;
  try {
    await input.io.writeFile(rollbackTmp, input.originalContent, 'utf8');
    await input.io.rename(rollbackTmp, input.oldPath);
    return { ok: true };
  } catch {
    await unlinkQuietly(input.io, rollbackTmp);
    return { ok: false };
  }
}

/** Deletes a temp file, ignoring a failure so that the caller's own error is the one reported. */
async function unlinkQuietly(io: CommitSupersedeIo, filePath: string): Promise<void> {
  try {
    await io.unlink(filePath);
  } catch {
    // A temp file left behind is the lesser of the two failures being handled here.
  }
}

// endregion | Helpers

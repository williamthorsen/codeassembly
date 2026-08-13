import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

import { describeError } from '@williamthorsen/toolbelt.errors';

/**
 * The subset of `node:fs/promises` operations `commitSupersede` performs. Tests inject mocks via this interface
 * so the rollback paths (which depend on specific renames failing) can be exercised without filesystem trickery.
 * Production callers use `REAL_IO` and never see this seam.
 */
export interface CommitSupersedeIo {
  writeFile: typeof writeFile;
  rename: typeof rename;
  unlink: typeof unlink;
}

/** Production IO: the real `node:fs/promises` functions. */
const REAL_IO: CommitSupersedeIo = { writeFile, rename, unlink };

/** Successful commit: both renames succeeded; the world is in the post-supersede state. */
export interface CommitSuccess {
  ok: true;
}

/**
 * Commit aborted, then rollback also failed. The old note is in an unknown state (either the new content from
 * step 3 or partially-rolled-back content); the new note is in its original state. Surfaces to the caller as
 * `partial-supersede`.
 */
export interface CommitFailure {
  ok: false;
  message: string;
}

/** Discriminated outcome of `commitSupersede`. */
export type CommitOutcome = CommitSuccess | CommitFailure;

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
 * System errors during step 1 or step 2 propagate (caller's main catch). When step 3 fails but rollback
 * succeeds, the original rename error re-throws so the failure surfaces as a system error — the contract
 * keeps rename failures uniform with other I/O failures, since the recoverable-vs-fatal split would otherwise
 * have to widen the structured error vocabulary for a narrow class.
 *
 * `io` defaults to real `node:fs/promises` operations; tests inject mocks to force specific failure paths.
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
      // Rollback succeeded: the world is consistent again. Re-throw so the failure surfaces as a system error.
      throw renameError;
    }
    return { ok: false, message: originalMessage };
  }
}

// region | Helpers

/** Restores the captured original bytes to `oldPath` via temp + rename. Returns ok on success. */
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

/** Deletes a temp file, ignoring a failure so the caller's own error is the one that surfaces. */
async function unlinkQuietly(io: CommitSupersedeIo, filePath: string): Promise<void> {
  try {
    await io.unlink(filePath);
  } catch {
    // A temp file left behind is the lesser of the two failures being handled here.
  }
}

// endregion | Helpers

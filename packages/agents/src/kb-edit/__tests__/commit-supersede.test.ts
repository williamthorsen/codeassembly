import { describe, expect, it } from 'vitest';

import { commitSupersede, type CommitSupersedeIo } from '../commit-supersede.ts';

interface Call {
  fn: 'writeFile' | 'rename' | 'unlink';
  path: string;
  content?: string;
}

/**
 * Builds a mock IO that records every call and lets the test register per-call failure modes:
 *
 * - `renameFailures`: zero-based indexes of `rename` calls that should reject with the given error.
 * - `writeFileFailures`: same shape for `writeFile`.
 *
 * `unlink` calls always succeed (production code best-effort-unlinks failed temps anyway).
 */
function makeIo(
  failures: {
    renameFailures?: Map<number, Error>;
    writeFileFailures?: Map<number, Error>;
  } = {},
): { io: CommitSupersedeIo; calls: Call[] } {
  const calls: Call[] = [];
  let renameIndex = 0;
  let writeFileIndex = 0;

  // Production code passes string paths and string contents; coerce here so the recorded `Call` is always
  // ergonomic to assert against without re-narrowing PathLike on every assertion.
  const asString = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

  const io: CommitSupersedeIo = {
    writeFile: (filePath, content) => {
      calls.push({ fn: 'writeFile', path: asString(filePath), content: asString(content) });
      const failure = failures.writeFileFailures?.get(writeFileIndex);
      writeFileIndex += 1;
      return failure === undefined ? Promise.resolve() : Promise.reject(failure);
    },
    rename: (oldPath, newPath) => {
      calls.push({ fn: 'rename', path: `${asString(oldPath)} -> ${asString(newPath)}` });
      const failure = failures.renameFailures?.get(renameIndex);
      renameIndex += 1;
      return failure === undefined ? Promise.resolve() : Promise.reject(failure);
    },
    unlink: (path) => {
      calls.push({ fn: 'unlink', path: asString(path) });
      return Promise.resolve();
    },
  };

  return { io, calls };
}

const INPUT = {
  oldPath: '/vault/old.md',
  newPath: '/vault/new.md',
  oldOriginalContent: 'original old\n',
  oldNewContent: 'new old (with superseded-by)\n',
  newNewContent: 'new new (with supersedes)\n',
} as const;

describe(commitSupersede, () => {
  it('writes both temps, renames both, and returns ok on the happy path', async () => {
    const { io, calls } = makeIo();

    const result = await commitSupersede({ ...INPUT, io });

    expect(result).toEqual({ ok: true });
    // Sequence: writeFile oldTmp, writeFile newTmp, rename oldTmp->oldPath, rename newTmp->newPath.
    const fns = calls.map((c) => c.fn);
    expect(fns).toEqual(['writeFile', 'writeFile', 'rename', 'rename']);
  });

  it('cleans up oldTmp and re-throws when the second writeFile (newTmp) fails', async () => {
    const error = new Error('disk full');
    const { io, calls } = makeIo({ writeFileFailures: new Map([[1, error]]) });

    await expect(commitSupersede({ ...INPUT, io })).rejects.toBe(error);

    // After step-2 failure: oldTmp unlinked, no renames attempted.
    const fns = calls.map((c) => c.fn);
    expect(fns).toEqual(['writeFile', 'writeFile', 'unlink']);
  });

  it('cleans up both temps and re-throws when the first rename (oldTmp -> oldPath) fails', async () => {
    const error = new Error('permission denied');
    const { io, calls } = makeIo({ renameFailures: new Map([[0, error]]) });

    await expect(commitSupersede({ ...INPUT, io })).rejects.toBe(error);

    // After step-3 failure: both temps unlinked, second rename not attempted.
    const fns = calls.map((c) => c.fn);
    expect(fns).toEqual(['writeFile', 'writeFile', 'rename', 'unlink', 'unlink']);
  });

  it('restores the old note from captured original bytes when the second rename fails but rollback succeeds, then re-throws the rename error', async () => {
    // Rename index 0 = oldTmp->oldPath (succeeds), index 1 = newTmp->newPath (fails),
    // index 2 = rollbackTmp->oldPath (succeeds). Rollback succeeds → original error re-thrown.
    const renameError = new Error('rename to new failed');
    const { io, calls } = makeIo({ renameFailures: new Map([[1, renameError]]) });

    await expect(commitSupersede({ ...INPUT, io })).rejects.toBe(renameError);

    // Expected sequence:
    //   writeFile oldTmp, writeFile newTmp, rename oldTmp->oldPath, rename newTmp->newPath (fails),
    //   unlink newTmp, writeFile rollbackTmp, rename rollbackTmp->oldPath.
    const fns = calls.map((c) => c.fn);
    expect(fns).toEqual(['writeFile', 'writeFile', 'rename', 'rename', 'unlink', 'writeFile', 'rename']);
    // The rollback writeFile must carry the captured original bytes, not the mutated content.
    const rollbackWrite = calls[5];
    expect(rollbackWrite?.content).toBe(INPUT.oldOriginalContent);
  });

  it('returns ok: false with the original message when both the second rename and the rollback rename fail', async () => {
    // Rename index 1 (newTmp->newPath) fails, rename index 2 (rollbackTmp->oldPath) also fails.
    const renameError = new Error('rename to new failed');
    const rollbackError = new Error('rollback rename failed');
    const { io } = makeIo({
      renameFailures: new Map([
        [1, renameError],
        [2, rollbackError],
      ]),
    });

    const result = await commitSupersede({ ...INPUT, io });

    expect(result).toEqual({ ok: false, message: 'rename to new failed' });
  });

  it('returns ok: false when the second rename fails and the rollback writeFile fails', async () => {
    // Rename index 1 fails, writeFile index 2 (rollbackTmp) fails. Rollback can't even stage; partial-supersede.
    const renameError = new Error('rename to new failed');
    const writeError = new Error('rollback write failed');
    const { io } = makeIo({
      renameFailures: new Map([[1, renameError]]),
      writeFileFailures: new Map([[2, writeError]]),
    });

    const result = await commitSupersede({ ...INPUT, io });

    expect(result).toEqual({ ok: false, message: 'rename to new failed' });
  });
});

import { rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCommand } from '../fetch.ts';
import { resolveLedgerPaths } from '../ledger.ts';
import { git, makeGitFixture } from '../test-utils/make-git-fixture.ts';

describe(resolveLedgerPaths, () => {
  const scratch: string[] = [];

  afterEach(async () => {
    await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("resolves to the primary worktree's ledger from the primary worktree and from a linked one", async () => {
    const primary = makeGitFixture('groom-ledger-');
    const linked = `${primary}-linked`;
    scratch.push(primary, linked);
    git(primary, 'worktree', 'add', '--quiet', '-b', '15-linked', linked);
    const expected = path.join(primary, 'local', 'ticket-triage', 'ledger.jsonl');

    expect((await resolveLedgerPaths(runCommand, primary)).ledgerFile).toBe(expected);
    expect((await resolveLedgerPaths(runCommand, linked)).ledgerFile).toBe(expected);
    expect((await resolveLedgerPaths(runCommand, path.join(linked, '.'))).assessmentsDir).toBe(
      path.join(primary, 'local', 'ticket-triage', 'assessments'),
    );
  });
});

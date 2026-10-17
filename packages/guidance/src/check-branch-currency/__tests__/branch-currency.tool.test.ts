import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkBranchCurrency } from '../branch-currency.ts';
import { git, makeRemoteFixture, type RemoteFixture } from '../test-utils/make-remote-fixture.ts';

describe(checkBranchCurrency, () => {
  let fixture: RemoteFixture;

  beforeEach(() => {
    fixture = makeRemoteFixture();
  });

  afterEach(() => {
    fixture.remove();
  });

  it('reports a branch level with the base as current', () => {
    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toEqual({
      fetched: true,
      base: 'origin/main',
      behind: 0,
      ahead: 0,
      clean: true,
      pushed: false,
      gained: [],
    });
  });

  it('fetches the base and lists the commits that it gained, newest first', () => {
    const first = commitUpstream(fixture, 'First upstream change');
    const second = commitUpstream(fixture, 'Second upstream change');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ fetched: true, behind: 2, ahead: 0, clean: true, pushed: false });
    expect(result.fetched && result.gained).toEqual([
      { sha: second, subject: 'Second upstream change', touchesWork: null },
      { sha: first, subject: 'First upstream change', touchesWork: null },
    ]);
  });

  it('counts own commits that the upstream does not contain as unpushed', () => {
    commitUpstream(fixture, 'Upstream change');
    git(fixture.work, 'commit', '--quiet', '--allow-empty', '--message', 'Own change');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ behind: 1, ahead: 1, pushed: false });
  });

  it('reports own commits contained in the upstream as pushed', () => {
    commitUpstream(fixture, 'Upstream change');
    git(fixture.work, 'commit', '--quiet', '--allow-empty', '--message', 'Own change');
    git(fixture.work, 'push', '--quiet', '--set-upstream', 'origin', 'feature');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ behind: 1, ahead: 1, pushed: true });
  });

  it('does not report an upstream without own commits as pushed', () => {
    git(fixture.work, 'push', '--quiet', '--set-upstream', 'origin', 'feature');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ pushed: false });
  });

  it('reports a branch ahead of the base without counting it as behind', () => {
    git(fixture.work, 'commit', '--quiet', '--allow-empty', '--message', 'Own change');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ behind: 0, ahead: 1, gained: [] });
  });

  it('counts an untracked file as a dirty tree', () => {
    writeFileSync(path.join(fixture.work, 'notes.txt'), 'draft\n');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result).toMatchObject({ clean: false });
  });

  it('marks the gained commits that touch the work paths, matched from the repository root', () => {
    const touching = commitUpstream(fixture, 'Change the parser', 'src/parser/parse.ts');
    const other = commitUpstream(fixture, 'Change the docs', 'docs/guide.md');
    mkdirSync(path.join(fixture.work, 'nested'));

    const result = checkBranchCurrency({
      base: 'origin/main',
      cwd: path.join(fixture.work, 'nested'),
      paths: ['src/parser'],
    });

    expect(result.fetched && result.gained).toEqual([
      { sha: other, subject: 'Change the docs', touchesWork: false },
      { sha: touching, subject: 'Change the parser', touchesWork: true },
    ]);
  });

  it('counts a deletion of a work path as touching it', () => {
    commitUpstream(fixture, 'Add the parser', 'src/parse.ts');
    git(fixture.work, 'pull', '--quiet', '--ff-only', 'origin', 'main');
    git(fixture.upstream, 'rm', '--quiet', 'src/parse.ts');
    git(fixture.upstream, 'commit', '--quiet', '--message', 'Remove the parser');
    git(fixture.upstream, 'push', '--quiet', 'origin', 'main');

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: ['src/parse.ts'] });

    expect(result.fetched && result.gained.map((commit) => commit.touchesWork)).toEqual([true]);
  });

  it('reports a failed fetch with the error from git', () => {
    git(fixture.work, 'remote', 'set-url', 'origin', path.join(fixture.root, 'missing.git'));

    const result = checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] });

    expect(result.fetched).toBe(false);
    expect(!result.fetched && result.error).toContain('missing.git');
  });

  it('throws when the fetch succeeds but the base does not resolve', () => {
    git(fixture.work, 'config', 'remote.origin.fetch', '+refs/heads/other:refs/remotes/origin/other');
    git(fixture.work, 'update-ref', '-d', 'refs/remotes/origin/main');

    expect(() => checkBranchCurrency({ base: 'origin/main', cwd: fixture.work, paths: [] })).toThrow(
      /rev-list --count HEAD\.\.origin\/main failed/,
    );
  });
});

// region | Helpers

/** Commits in the upstream clone, writing `file` when given, pushes to the remote's `main`, and returns the new SHA. */
function commitUpstream(fixture: RemoteFixture, message: string, file?: string): string {
  if (file === undefined) {
    git(fixture.upstream, 'commit', '--quiet', '--allow-empty', '--message', message);
  } else {
    const filePath = path.join(fixture.upstream, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${message}\n`);
    git(fixture.upstream, 'add', file);
    git(fixture.upstream, 'commit', '--quiet', '--message', message);
  }
  git(fixture.upstream, 'push', '--quiet', 'origin', 'main');
  return git(fixture.upstream, 'rev-parse', 'HEAD');
}

// endregion | Helpers

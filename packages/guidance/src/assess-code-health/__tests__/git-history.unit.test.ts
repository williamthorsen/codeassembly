import { describe, expect, it } from 'vitest';

import {
  type CommitChanges,
  computeCoChange,
  computeHotspots,
  MAX_FILES_PER_COMMIT,
  parseNumstatLog,
  resolveRenamedPath,
} from '../git-history.ts';

describe('parseNumstatLog', () => {
  it('groups files by commit, resolves renames, and skips binary files', () => {
    const output = [
      'COMMIT\taaa\t2026-10-01T00:00:00Z',
      '',
      '3\t1\tsrc/a.ts',
      '-\t-\tassets/logo.png',
      '2\t0\tsrc/{old => new}/b.ts',
      'COMMIT\tbbb\t2026-09-01T00:00:00Z',
      '',
      '1\t1\tsrc/c.ts => src/d.ts',
    ].join('\n');

    expect(parseNumstatLog(output)).toEqual([
      { commit: 'aaa', date: '2026-10-01T00:00:00Z', files: ['src/a.ts', 'src/new/b.ts'] },
      { commit: 'bbb', date: '2026-09-01T00:00:00Z', files: ['src/d.ts'] },
    ]);
  });
});

describe('resolveRenamedPath', () => {
  it.each([
    ['src/a.ts', 'src/a.ts'],
    ['src/a.ts => lib/a.ts', 'lib/a.ts'],
    ['src/{old => new}/a.ts', 'src/new/a.ts'],
    ['src/{ => nested}/a.ts', 'src/nested/a.ts'],
    ['src/{old => }/a.ts', 'src/a.ts'],
  ])('resolves %s to %s', (input, expected) => {
    expect(resolveRenamedPath(input)).toBe(expected);
  });
});

describe('computeHotspots', () => {
  it('scores files existing at HEAD by commits times lines, highest first', () => {
    const commits = [buildCommit(['a.ts', 'b.ts']), buildCommit(['a.ts']), buildCommit(['gone.ts'])];
    const lines = new Map([
      ['a.ts', 10],
      ['b.ts', 50],
    ]);

    expect(computeHotspots(commits, lines)).toEqual([
      { path: 'b.ts', commits: 1, lines: 50, score: 50, rank: 1 },
      { path: 'a.ts', commits: 2, lines: 10, score: 20, rank: 2 },
    ]);
  });

  it('ignores a commit that touches more files than the bulk cap', () => {
    const bulk = buildCommit(Array.from({ length: MAX_FILES_PER_COMMIT + 1 }, (_, index) => `f${index}.ts`));

    expect(computeHotspots([bulk], new Map([['f0.ts', 5]]))).toEqual([]);
  });
});

describe('computeCoChange', () => {
  it('reports pairs that changed together at least three times', () => {
    const commits = [
      buildCommit(['a.ts', 'b.ts', 'c.ts']),
      buildCommit(['b.ts', 'a.ts']),
      buildCommit(['a.ts', 'b.ts']),
      buildCommit(['a.ts', 'c.ts']),
    ];

    expect(computeCoChange(commits, new Set(['a.ts', 'b.ts', 'c.ts']))).toEqual([{ a: 'a.ts', b: 'b.ts', commits: 3 }]);
  });

  it('leaves out a file that no longer exists', () => {
    const commits = [
      buildCommit(['a.ts', 'gone.ts']),
      buildCommit(['a.ts', 'gone.ts']),
      buildCommit(['a.ts', 'gone.ts']),
    ];

    expect(computeCoChange(commits, new Set(['a.ts']))).toEqual([]);
  });
});

// region | Helpers

/** Builds a commit that changed `files`. */
function buildCommit(files: string[]): CommitChanges {
  return { commit: 'c', date: '2026-10-01T00:00:00Z', files };
}

// endregion | Helpers

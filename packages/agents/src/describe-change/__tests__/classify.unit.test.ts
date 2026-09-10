import { describe, expect, it } from 'vitest';

import { compileTemplate } from '../../change-grammar/compile-template.ts';
import type { Taxonomy } from '../../change-grammar/types.ts';
import { classifyCommits } from '../classify.ts';
import type { RawCommit } from '../read-commits.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'required', key: 'drop', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'fix', tier: 'public' },
    { breakingPolicy: 'optional', key: 'sec', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'refactor', tier: 'internal' },
  ],
};

const NODES = compileTemplate('[[{scope}|]{type}: ]{title}');

describe(classifyCommits, () => {
  it('lets one feat speak for a branch carrying three fixes', () => {
    const result = classifyCommits(
      buildCommits([
        'agents|fix: Correct the guard',
        'agents|feat: Add the parser',
        'agents|fix: Correct the other guard',
        'agents|fix: Correct the third guard',
      ]),
      NODES,
      TAXONOMY,
    );

    expect(result.head).toStrictEqual({ scope: 'agents', type: 'feat' });
    expect(result.entries).toHaveLength(4);
  });

  it('carries the breaking marker onto the head', () => {
    const result = classifyCommits(
      buildCommits(['agents|sec!: Patch the parser', 'agents|fix: Correct the guard']),
      NODES,
      TAXONOMY,
    );

    expect(result.head).toStrictEqual({ breaking: true, scope: 'agents', type: 'sec' });
  });

  it('names no scope where the entries disagree on one', () => {
    const result = classifyCommits(
      buildCommits(['agents|feat: Add the parser', 'kb|feat: Add the reader']),
      NODES,
      TAXONOMY,
    );

    expect(result.head).toStrictEqual({ type: 'feat' });
  });

  it('reports a fix that carries the marker its policy forbids, leaving the entry as written', () => {
    const result = classifyCommits(buildCommits(['agents|fix!: Correct the guard']), NODES, TAXONOMY);

    expect(result.violations).toStrictEqual([{ commit: 'commit0', policy: 'forbidden', type: 'fix' }]);
    expect(result.entries[0]?.record).toStrictEqual({
      breaking: true,
      scope: 'agents',
      title: 'Correct the guard',
      type: 'fix',
    });
  });

  it('reports a drop that omits the marker its policy requires', () => {
    const result = classifyCommits(buildCommits(['agents|drop: Remove the legacy reader']), NODES, TAXONOMY);

    expect(result.violations).toStrictEqual([{ commit: 'commit0', policy: 'required', type: 'drop' }]);
  });

  it('lists a subject no template matched and keeps it out of the entries', () => {
    const result = classifyCommits(buildCommits(['agents|feat: Add the parser', 'wip']), NODES, TAXONOMY);

    expect(result.unclassified).toStrictEqual([{ commit: 'commit1', subject: 'wip' }]);
    expect(result.entries).toHaveLength(1);
    expect(result.head).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('yields no head for a branch whose every subject went unmatched', () => {
    const result = classifyCommits(buildCommits(['wip', 'more wip']), NODES, TAXONOMY);

    expect(result.head).toBeUndefined();
    expect(result.entries).toStrictEqual([]);
    expect(result.unclassified).toHaveLength(2);
  });

  it('yields no head for an empty range', () => {
    expect(classifyCommits([], NODES, TAXONOMY).head).toBeUndefined();
  });

  it('takes a commit’s trailers in place of its subject', () => {
    const commits: RawCommit[] = [
      {
        hash: 'condensed',
        subject: 'agents|fix: Correct the guard',
        trailers: ['agents|feat: Add the parser', 'agents|fix: Correct the guard'],
      },
    ];

    const result = classifyCommits(commits, NODES, TAXONOMY);

    expect(result.entries.map((entry) => entry.record.type)).toStrictEqual(['feat', 'fix']);
    expect(result.head).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('reads a subject alongside another commit’s trailers', () => {
    const commits: RawCommit[] = [
      { hash: 'condensed', subject: 'agents|fix: Squashed', trailers: ['agents|feat: Add the parser'] },
      { hash: 'plain', subject: 'agents|refactor: Extract the reader', trailers: [] },
    ];

    const result = classifyCommits(commits, NODES, TAXONOMY);

    expect(result.entries.map((entry) => entry.commit)).toStrictEqual(['condensed', 'plain']);
    expect(result.head).toStrictEqual({ scope: 'agents', type: 'feat' });
  });
});

// region | Helpers

/** Builds one trailerless commit per subject, hashed by position so a report names which subject it came from. */
function buildCommits(subjects: readonly string[]): RawCommit[] {
  return subjects.map((subject, index) => ({ hash: `commit${index}`, subject, trailers: [] }));
}

// endregion | Helpers

import { describe, expect, it } from 'vitest';

import { compileTemplate } from '../../change-grammar/compile-template.ts';
import type { Taxonomy } from '../../change-grammar/types.ts';
import { consolidateBranch } from '../consolidate-branch.ts';
import type { RawCommit } from '../read-commits.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'required', key: 'drop', tier: 'public' },
    { breakingPolicy: 'optional', key: 'fix', tier: 'public' },
    { breakingPolicy: 'optional', key: 'sec', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'refactor', tier: 'internal' },
    { breakingPolicy: 'forbidden', key: 'ai', tier: 'process' },
    { breakingPolicy: 'forbidden', key: 'deps', tier: 'process' },
  ],
};

const NODES = compileTemplate('[[{scope}|]{type}: ]{title}');

describe(consolidateBranch, () => {
  it('lets one feat represent a branch containing three fixes', () => {
    const result = consolidateBranch(
      buildCommits([
        'agents|fix: Correct the guard',
        'agents|feat: Add the parser',
        'agents|fix: Correct the other guard',
        'agents|fix: Correct the third guard',
      ]),
      NODES,
      TAXONOMY,
    );

    expect(result.consolidatedRecord).toStrictEqual({ scope: 'agents', type: 'feat' });
    expect(result.entries).toHaveLength(4);
  });

  it('sets the breaking marker on the consolidated record', () => {
    const result = consolidateBranch(
      buildCommits(['agents|sec!: Patch the parser', 'agents|fix: Correct the guard']),
      NODES,
      TAXONOMY,
    );

    expect(result.consolidatedRecord).toStrictEqual({ breaking: true, scope: 'agents', type: 'sec' });
  });

  it('names no scope when the entries disagree on one', () => {
    const result = consolidateBranch(
      buildCommits(['agents|feat: Add the parser', 'kb|feat: Add the reader']),
      NODES,
      TAXONOMY,
    );

    expect(result.consolidatedRecord).toStrictEqual({ type: 'feat' });
  });

  it('sets aside one root commit among the commits of one workspace', () => {
    const result = consolidateBranch(
      buildCommits([
        'agents|feat: Add the parser',
        'agents|fix: Correct the guard',
        'agents|fix: Correct the other guard',
        'agents|refactor: Restructure the guard',
        'agents|fix: Correct the third guard',
        'root|ai: Record the sweep in the ledger',
      ]),
      NODES,
      TAXONOMY,
    );

    expect(result.consolidatedRecord).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('sets aside a process-tier commit naming another workspace', () => {
    const result = consolidateBranch(
      buildCommits(['img-promoter|feat: Add the promoter', 'web|deps: Move the specifiers to the catalog']),
      NODES,
      TAXONOMY,
    );

    expect(result.consolidatedRecord).toStrictEqual({ scope: 'img-promoter', type: 'feat' });
  });

  it('reports a refactor that spells the marker forbidden by its policy, leaving the entry as written', () => {
    const result = consolidateBranch(buildCommits(['agents|refactor!: Restructure the guard']), NODES, TAXONOMY);

    expect(result.violations).toStrictEqual([{ commit: 'commit0', policy: 'forbidden', type: 'refactor' }]);
    expect(result.entries[0]?.record).toStrictEqual({
      breaking: true,
      scope: 'agents',
      title: 'Restructure the guard',
      type: 'refactor',
    });
  });

  it('reports a drop that omits the marker required by its policy', () => {
    const result = consolidateBranch(buildCommits(['agents|drop: Remove the legacy reader']), NODES, TAXONOMY);

    expect(result.violations).toStrictEqual([{ commit: 'commit0', policy: 'required', type: 'drop' }]);
  });

  it('lists a subject matched by no template and keeps it out of the entries', () => {
    const result = consolidateBranch(buildCommits(['agents|feat: Add the parser', 'wip']), NODES, TAXONOMY);

    expect(result.unmatched).toStrictEqual([{ commit: 'commit1', subject: 'wip' }]);
    expect(result.entries).toHaveLength(1);
    expect(result.consolidatedRecord).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('yields no consolidated record for a branch whose every subject went unmatched', () => {
    const result = consolidateBranch(buildCommits(['wip', 'more wip']), NODES, TAXONOMY);

    expect(result.consolidatedRecord).toBeUndefined();
    expect(result.entries).toStrictEqual([]);
    expect(result.unmatched).toHaveLength(2);
  });

  it('yields no consolidated record for an empty range', () => {
    expect(consolidateBranch([], NODES, TAXONOMY).consolidatedRecord).toBeUndefined();
  });

  it('takes a commit’s trailers in place of its subject', () => {
    const commits: RawCommit[] = [
      {
        hash: 'condensed',
        subject: 'agents|fix: Correct the guard',
        trailers: ['agents|feat: Add the parser', 'agents|fix: Correct the guard'],
      },
    ];

    const result = consolidateBranch(commits, NODES, TAXONOMY);

    expect(result.entries.map((entry) => entry.record.type)).toStrictEqual(['feat', 'fix']);
    expect(result.consolidatedRecord).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('reads a trailer naming several scopes as one entry that carries them all', () => {
    const commits: RawCommit[] = [
      { hash: 'condensed', subject: 'agents|feat: Squashed', trailers: ['agents,kb|feat: Add the reader'] },
    ];

    const result = consolidateBranch(commits, NODES, TAXONOMY);

    expect(result.entries.map((entry) => entry.record.scope)).toStrictEqual(['agents,kb']);
    expect(result.consolidatedRecord).toStrictEqual({ type: 'feat' });
  });

  it('reads a subject alongside another commit’s trailers', () => {
    const commits: RawCommit[] = [
      { hash: 'condensed', subject: 'agents|fix: Squashed', trailers: ['agents|feat: Add the parser'] },
      { hash: 'plain', subject: 'agents|refactor: Extract the reader', trailers: [] },
    ];

    const result = consolidateBranch(commits, NODES, TAXONOMY);

    expect(result.entries.map((entry) => entry.commit)).toStrictEqual(['condensed', 'plain']);
    expect(result.consolidatedRecord).toStrictEqual({ scope: 'agents', type: 'feat' });
  });
});

// region | Helpers

/** Builds one trailerless commit per subject, hashed by position so that a report names which subject it came from. */
function buildCommits(subjects: readonly string[]): RawCommit[] {
  return subjects.map((subject, index) => ({ hash: `commit${index}`, subject, trailers: [] }));
}

// endregion | Helpers

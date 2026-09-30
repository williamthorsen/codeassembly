import { describe, expect, it } from 'vitest';

import type { Taxonomy } from '../../change-grammar/types.ts';
import type { ChangeEntry } from '../change-entries.ts';
import { findDefects, findEntryDefects } from '../find-defects.ts';

/** A taxonomy declaring one type of each breaking policy, independent of the repository's own. */
const TAXONOMY: Taxonomy = {
  tiers: ['public', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

describe(findDefects, () => {
  it('reports nothing for a declared type whose optional policy admits either marker', () => {
    expect(findDefects({ breaking: true, scope: 'agents', type: 'feat' }, TAXONOMY)).toStrictEqual([]);
    expect(findDefects({ scope: 'agents', type: 'feat' }, TAXONOMY)).toStrictEqual([]);
  });

  it('reports a record that does not name a type', () => {
    expect(findDefects({ scope: 'agents' }, TAXONOMY)).toStrictEqual([{ kind: 'missing-type' }]);
  });

  it('reports a type that the taxonomy does not declare', () => {
    expect(findDefects({ type: 'feature' }, TAXONOMY)).toStrictEqual([{ kind: 'undeclared-type', type: 'feature' }]);
  });

  it('reports a marker that the type’s policy forbids', () => {
    expect(findDefects({ breaking: true, type: 'docs' }, TAXONOMY)).toStrictEqual([
      { kind: 'policy-violation', policy: 'forbidden', type: 'docs' },
    ]);
  });
});

describe(findEntryDefects, () => {
  it('reports nothing for entries whose types are declared and whose markers their policies admit', () => {
    expect(
      findEntryDefects([entryOf({ breaking: true, type: 'feat' }), entryOf({ type: 'docs' })], TAXONOMY),
    ).toStrictEqual([]);
  });

  it('reports each defective entry in entry order, naming its index', () => {
    const entries = [
      entryOf({ type: 'feat' }),
      entryOf({ type: 'feature' }),
      entryOf({ breaking: true, type: 'docs' }),
    ];

    expect(findEntryDefects(entries, TAXONOMY)).toStrictEqual([
      { entry: 1, kind: 'undeclared-type', type: 'feature' },
      { entry: 2, kind: 'policy-violation', policy: 'forbidden', type: 'docs' },
    ]);
  });

  it('reads a type spelled with the marker as undeclared', () => {
    expect(findEntryDefects([entryOf({ type: 'feat!' })], TAXONOMY)).toStrictEqual([
      { entry: 0, kind: 'undeclared-type', type: 'feat!' },
    ]);
  });
});

// region | Helpers

/** Builds a change entry that names the type and its marker. */
function entryOf(record: { breaking?: boolean; type: string }): ChangeEntry {
  return { breaking: record.breaking === true, scopes: ['agents'], text: 'Adds foo', type: record.type };
}

// endregion | Helpers

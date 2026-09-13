import { describe, expect, it } from 'vitest';

import type { Taxonomy } from '../../change-grammar/types.ts';
import { findDefects } from '../find-defects.ts';

/** A taxonomy declaring one type of each breaking policy, independent of the repository's own. */
const TAXONOMY: Taxonomy = {
  tiers: ['public', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'required', key: 'drop', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

describe(findDefects, () => {
  it('reports nothing for a declared type that its policy admits', () => {
    expect(findDefects({ breaking: true, scope: 'agents', type: 'feat' }, TAXONOMY)).toStrictEqual([]);
  });

  it('reports a record that names no type', () => {
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

  it('reports a marker that the type’s policy requires and the record omits', () => {
    expect(findDefects({ type: 'drop' }, TAXONOMY)).toStrictEqual([
      { kind: 'policy-violation', policy: 'required', type: 'drop' },
    ]);
  });
});

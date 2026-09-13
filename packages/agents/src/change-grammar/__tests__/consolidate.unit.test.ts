import { describe, expect, it } from 'vitest';

import { consolidate } from '../consolidate.ts';
import type { Taxonomy } from '../types.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { key: 'feat', tier: 'public' },
    { key: 'drop', tier: 'public' },
    { key: 'fix', tier: 'public' },
    { key: 'sec', tier: 'public' },
    { key: 'refactor', tier: 'internal' },
    { key: 'docs', tier: 'process' },
  ],
};

describe(consolidate, () => {
  it('lets one feat speak over three fixes, since listing order ranks and frequency does not', () => {
    const entries = [
      { title: 'Correct the guard', type: 'fix' },
      { title: 'Add foo', type: 'feat' },
      { title: 'Correct the other guard', type: 'fix' },
      { title: 'Correct the third guard', type: 'fix' },
    ];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ type: 'feat' });
  });

  it('lets a breaking entry outrank a non-breaking one of a higher-listed type', () => {
    const entries = [
      { breaking: true, title: 'Patch the parser', type: 'sec' },
      { title: 'Correct the guard', type: 'fix' },
    ];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ breaking: true, type: 'sec' });
  });

  it('ranks by tier before listing order', () => {
    const entries = [
      { title: 'Rewrite the README', type: 'docs' },
      { title: 'Rename the lane fold', type: 'refactor' },
    ];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ type: 'refactor' });
  });

  it('carries the scope every entry agrees on', () => {
    const entries = [
      { scope: 'agents', type: 'fix' },
      { scope: 'agents', type: 'feat' },
    ];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('names no scope for a branch carrying two', () => {
    const entries = [
      { scope: 'agents', type: 'feat' },
      { scope: 'run-core', type: 'fix' },
    ];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ type: 'feat' });
  });

  it('names no scope where one entry carries none', () => {
    const entries = [{ scope: 'agents', type: 'feat' }, { type: 'fix' }];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('skips an entry naming a type the taxonomy does not declare', () => {
    const entries = [{ type: 'invented' }, { type: 'fix' }];

    expect(consolidate(entries, TAXONOMY)).toStrictEqual({ type: 'fix' });
  });

  it('yields an empty record for no entries', () => {
    expect(consolidate([], TAXONOMY)).toStrictEqual({});
  });

  it('yields an empty record where no entry names a declared type', () => {
    expect(consolidate([{ title: 'Add foo' }], TAXONOMY)).toStrictEqual({});
  });
});

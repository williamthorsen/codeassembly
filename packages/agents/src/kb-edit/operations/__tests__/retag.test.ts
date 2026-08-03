import type { AliasMap } from '@williamthorsen/kb';
import type { KbAssertion } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { retag } from '../retag.ts';

/** Builds a baseline assertion record for the operation under test, with overrides merged in. */
function buildAssertion(overrides: Partial<KbAssertion> = {}): KbAssertion {
  return {
    recordType: 'assertion',
    title: 'Example',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['old', 'tags'],
    addressedBy: [],
    extra: {},
    body: 'body',
    ...overrides,
  };
}

const NO_ALIASES: AliasMap = new Map();
const NODE_ALIASES: AliasMap = new Map([
  ['node.js', 'nodejs'],
  ['node', 'nodejs'],
]);

describe(retag, () => {
  it('replaces the tag list with the supplied tags and leaves updated unchanged', () => {
    const result = retag(buildAssertion(), ['new', 'set'], NO_ALIASES);

    expect(result.record.tags).toEqual(['new', 'set']);
    expect(result.record.updated).toBe('2026-05-01T08:17:23Z');
  });

  it('returns originalTags and canonicalTags for audit', () => {
    const result = retag(buildAssertion(), ['node.js', 'react'], NODE_ALIASES);

    expect(result.originalTags).toEqual(['node.js', 'react']);
    expect(result.canonicalTags).toEqual(['nodejs', 'react']);
    expect(result.record.tags).toEqual(['nodejs', 'react']);
  });

  it('dedupes after canonicalization in first-occurrence order', () => {
    // node.js and node both canonicalize to nodejs; the second arrival is dropped.
    const result = retag(buildAssertion(), ['node.js', 'react', 'node'], NODE_ALIASES);

    expect(result.canonicalTags).toEqual(['nodejs', 'react']);
  });

  it('accepts an empty list and writes empty tags', () => {
    const result = retag(buildAssertion(), [], NO_ALIASES);

    expect(result.record.tags).toEqual([]);
    expect(result.canonicalTags).toEqual([]);
  });

  it('does not mutate the input record', () => {
    const record = buildAssertion();

    retag(record, ['x'], NO_ALIASES);

    expect(record.tags).toEqual(['old', 'tags']);
  });
});

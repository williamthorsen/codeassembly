import type { AliasMap, Frontmatter } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { retag } from '../retag.ts';

function frontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Example',
    recordType: 'assertion',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['old', 'tags'],
    extra: {},
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
    const result = retag({
      frontmatter: frontmatter(),
      body: 'b',
      tags: ['new', 'set'],
      aliases: NO_ALIASES,
    });

    expect(result.frontmatter.tags).toEqual(['new', 'set']);
    expect(result.frontmatter.updated).toBe('2026-05-01T08:17:23Z');
  });

  it('returns originalTags and canonicalTags for audit', () => {
    const result = retag({
      frontmatter: frontmatter(),
      body: 'b',
      tags: ['node.js', 'react'],
      aliases: NODE_ALIASES,
    });

    expect(result.originalTags).toEqual(['node.js', 'react']);
    expect(result.canonicalTags).toEqual(['nodejs', 'react']);
    expect(result.frontmatter.tags).toEqual(['nodejs', 'react']);
  });

  it('dedupes after canonicalization in first-occurrence order', () => {
    // node.js and node both canonicalize to nodejs; the second arrival is dropped.
    const result = retag({
      frontmatter: frontmatter(),
      body: 'b',
      tags: ['node.js', 'react', 'node'],
      aliases: NODE_ALIASES,
    });

    expect(result.canonicalTags).toEqual(['nodejs', 'react']);
  });

  it('accepts an empty list and writes empty tags', () => {
    const result = retag({
      frontmatter: frontmatter(),
      body: 'b',
      tags: [],
      aliases: NO_ALIASES,
    });

    expect(result.frontmatter.tags).toEqual([]);
    expect(result.canonicalTags).toEqual([]);
  });

  it('does not mutate the input frontmatter', () => {
    const fm = frontmatter();

    retag({ frontmatter: fm, body: 'b', tags: ['x'], aliases: NO_ALIASES });

    expect(fm.tags).toEqual(['old', 'tags']);
  });
});

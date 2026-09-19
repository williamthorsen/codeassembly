import { describe, expect, it } from 'vitest';

import { REPO_SEGMENT_PLACEHOLDER, splitRepo, toSafeSegment } from '../repo-segments.ts';

describe(splitRepo, () => {
  it('splits an owner/name repo into its two segments', () => {
    expect(splitRepo('williamthorsen/codeassembly')).toEqual(['williamthorsen', 'codeassembly']);
  });

  it('substitutes the placeholder for the name when the repo names no owner', () => {
    expect(splitRepo('bare-name')).toEqual(['bare-name', REPO_SEGMENT_PLACEHOLDER]);
  });

  it('substitutes both segments when the repo is undefined', () => {
    expect(splitRepo(undefined)).toEqual([REPO_SEGMENT_PLACEHOLDER, REPO_SEGMENT_PLACEHOLDER]);
  });

  it('drops everything past the name, which the two path segments have no room for', () => {
    expect(splitRepo('owner/name/extra')).toEqual(['owner', 'name']);
  });
});

describe(toSafeSegment, () => {
  it('returns a value that already names one component unchanged', () => {
    expect(toSafeSegment('main', '_none')).toBe('main');
  });

  it('flattens both separators to hyphens', () => {
    expect(toSafeSegment(String.raw`a/b\c`, '_none')).toBe('a-b-c');
  });

  it('substitutes the placeholder for an empty value', () => {
    expect(toSafeSegment(' ', '_none')).toBe('_none');
  });

  it('substitutes the placeholder for a value of dots only, which would traverse upward', () => {
    expect(toSafeSegment('..', '_none')).toBe('_none');
  });

  it('flattens a traversal that also names a directory', () => {
    expect(toSafeSegment('../../escape', '_none')).toBe('..-..-escape');
  });
});

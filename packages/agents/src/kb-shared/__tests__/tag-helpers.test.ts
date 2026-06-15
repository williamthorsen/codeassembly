import { describe, expect, it } from 'vitest';

import { parseTagList } from '../tag-helpers.ts';

describe(parseTagList, () => {
  it('splits a comma-separated string into individual tags', () => {
    expect(parseTagList('alpha,beta,gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('trims surrounding whitespace from each tag', () => {
    expect(parseTagList(' alpha , beta ,gamma ')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('drops empty segments from leading, trailing, and doubled commas', () => {
    expect(parseTagList(',alpha,,beta,')).toEqual(['alpha', 'beta']);
  });

  it('returns a single-element list for a value with no commas', () => {
    expect(parseTagList('alpha')).toEqual(['alpha']);
  });

  it('returns an empty list for an empty string', () => {
    expect(parseTagList('')).toEqual([]);
  });

  it('returns an empty list for whitespace and commas only', () => {
    expect(parseTagList(' , , ')).toEqual([]);
  });
});

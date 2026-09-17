import { describe, expect, it } from 'vitest';

import { parseTagList } from '../tag-helpers.ts';

describe(parseTagList, () => {
  it('parses a comma-separated tag string, trimming and dropping empties', () => {
    expect(parseTagList(' alpha , beta ,, ')).toEqual(['alpha', 'beta']);
  });
});

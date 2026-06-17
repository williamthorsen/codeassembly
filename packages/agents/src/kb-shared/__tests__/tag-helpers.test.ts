import { describe, expect, it } from 'vitest';

import { parseTagList } from '../tag-helpers.ts';

// parseTagList delegates to splitCommaList (covered exhaustively in note-helpers.test.ts); this guards the wiring.
describe(parseTagList, () => {
  it('parses a comma-separated tag string, trimming and dropping empties', () => {
    expect(parseTagList(' alpha , beta ,, ')).toEqual(['alpha', 'beta']);
  });
});

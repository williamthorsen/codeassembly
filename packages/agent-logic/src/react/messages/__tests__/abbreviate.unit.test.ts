import { describe, expect, it } from 'vitest';

import { abbreviate } from '../abbreviate.ts';

describe(abbreviate, () => {
  it('keeps text of five words or fewer whole', () => {
    expect(abbreviate('  The prompt says both. ')).toBe('The prompt says both.');
  });

  it('cuts longer text to its first words and marks the cut', () => {
    expect(abbreviate('Mention the promotion when it feels natural.')).toBe('Mention the promotion when it…');
    expect(abbreviate('one two three', 2)).toBe('one two…');
  });
});

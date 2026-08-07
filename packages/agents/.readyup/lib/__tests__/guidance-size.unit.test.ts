import { describe, expect, it } from 'vitest';

import { countGuidanceLines } from '../guidance-size.ts';

describe(countGuidanceLines, () => {
  it('treats a trailing newline as terminating the final line', () => {
    expect(countGuidanceLines('first\nsecond\n')).toBe(2);
  });

  it('counts a final line that carries no terminator', () => {
    expect(countGuidanceLines('first\nsecond')).toBe(2);
  });

  it('counts blank lines between content', () => {
    expect(countGuidanceLines('first\n\nthird\n')).toBe(3);
  });

  it('counts a lone terminated line as one', () => {
    expect(countGuidanceLines('only\n')).toBe(1);
  });

  it('counts empty content as no lines', () => {
    expect(countGuidanceLines('')).toBe(0);
  });

  it('counts a lone newline as one empty line', () => {
    expect(countGuidanceLines('\n')).toBe(1);
  });
});

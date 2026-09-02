import { describe, expect, it } from 'vitest';

import { renderRulebookVersionLines } from '../rulebook-version-line.ts';

describe(renderRulebookVersionLines, () => {
  it('renders the version on a comment line', () => {
    expect(renderRulebookVersionLines('11')).toEqual(['<!-- rulebook-version: 11 -->']);
  });

  it('renders no line for a rulebook declaring no version', () => {
    expect(renderRulebookVersionLines(undefined)).toEqual([]);
  });

  it('renders a version that is not a bare number', () => {
    expect(renderRulebookVersionLines('2026.03-rc1')).toEqual(['<!-- rulebook-version: 2026.03-rc1 -->']);
  });
});

import { describe, expect, it } from 'vitest';

import { renderRulebookVersionLines } from '../rulebook-version-line.ts';

describe(renderRulebookVersionLines, () => {
  it('renders the version on a comment line', () => {
    expect(renderRulebookVersionLines('11')).toEqual(['<!-- rulebook-version: 11 -->']);
  });

  it('does not render a line for a rulebook that does not declare a version', () => {
    expect(renderRulebookVersionLines(undefined)).toEqual([]);
  });

  it('renders a version that is not a bare number', () => {
    expect(renderRulebookVersionLines('2026.03-rc1')).toEqual(['<!-- rulebook-version: 2026.03-rc1 -->']);
  });
});

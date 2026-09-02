import { describe, expect, it } from 'vitest';

import { renderRulebookVersionLine } from '../rulebook-version-line.ts';

describe(renderRulebookVersionLine, () => {
  it('renders the version on a comment line', () => {
    expect(renderRulebookVersionLine('11')).toBe('<!-- rulebook-version: 11 -->');
  });

  it('renders nothing for a rulebook declaring no version', () => {
    expect(renderRulebookVersionLine(undefined)).toBe('');
  });

  it('renders a version that is not a bare number', () => {
    expect(renderRulebookVersionLine('2026.03-rc1')).toBe('<!-- rulebook-version: 2026.03-rc1 -->');
  });
});

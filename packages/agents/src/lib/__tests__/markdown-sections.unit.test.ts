import { describe, expect, it } from 'vitest';

import { extractSection } from '../markdown-sections.ts';

describe(extractSection, () => {
  it('captures everything up to the next second-level heading', () => {
    const text = '## What\n\nThe lede.\n\n## Why\n\nThe motivation.\n';

    expect(extractSection({ text, heading: 'What' })).toBe('The lede.');
  });

  it('captures a nested third-level heading rather than stopping at it', () => {
    const text = '## Body\n\nLead.\n\n### Detail\n\nMore.\n\n## Next\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('Lead.\n\n### Detail\n\nMore.');
  });

  it('captures the final section when no heading follows it', () => {
    const text = '# Title\n\n## Body\n\nThe lede.\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('The lede.');
  });

  it('matches the heading without regard to case', () => {
    expect(extractSection({ text: '## WHAT\n\nThe lede.\n', heading: 'What' })).toBe('The lede.');
  });

  it('yields null for a heading the document does not carry', () => {
    expect(extractSection({ text: '## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });

  it('yields null for a heading whose section holds no text', () => {
    expect(extractSection({ text: '## What\n\n## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });
});

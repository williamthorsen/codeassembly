import { describe, expect, it } from 'vitest';

import { extractSection, replaceSections } from '../markdown-sections.ts';

describe(extractSection, () => {
  it('captures everything up to the next second-level heading', () => {
    const text = '## What\n\nThe lede.\n\n## Why\n\nThe motivation.\n';

    expect(extractSection({ text, heading: 'What' })).toBe('The lede.');
  });

  it('captures a nested third-level heading rather than stopping at it', () => {
    const text = '## Body\n\nLead.\n\n### Detail\n\nMore.\n\n## Next\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('Lead.\n\n### Detail\n\nMore.');
  });

  it('captures the final section when the document does not contain another heading after it', () => {
    const text = '# Title\n\n## Body\n\nThe lede.\n';

    expect(extractSection({ text, heading: 'Body' })).toBe('The lede.');
  });

  it('matches the heading without regard to case', () => {
    expect(extractSection({ text: '## WHAT\n\nThe lede.\n', heading: 'What' })).toBe('The lede.');
  });

  it('yields null for a heading that the document does not contain', () => {
    expect(extractSection({ text: '## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });

  it('yields null for a heading whose section does not contain any text', () => {
    expect(extractSection({ text: '## What\n\n## Why\n\nThe motivation.\n', heading: 'What' })).toBeNull();
  });
});

describe(replaceSections, () => {
  it('replaces a section up to the next second-level heading, keeping its nested headings out', () => {
    const text = '# Title\n\n## Context\n\nOld.\n\n### Detail\n\nOld detail.\n\n## Notes\n\nKept.\n';

    expect(replaceSections({ text, sections: [{ heading: 'context', body: 'New.' }] })).toBe(
      '# Title\n\n## Context\n\nNew.\n\n## Notes\n\nKept.\n',
    );
  });

  it('replaces the final section and appends the sections that the text does not contain, in order', () => {
    const text = '## Problem\n\nIt fails.\n\n## Context\n\nOld.';
    const sections = [
      { heading: 'Acceptance criteria', body: '- [ ] It works.' },
      { heading: 'Context', body: 'New.' },
      { heading: 'Notes', body: 'Last.' },
    ];

    expect(replaceSections({ text, sections })).toBe(
      '## Problem\n\nIt fails.\n\n## Context\n\nNew.\n\n## Acceptance criteria\n\n- [ ] It works.\n\n## Notes\n\nLast.\n',
    );
  });

  it('appends to an empty body', () => {
    expect(replaceSections({ text: '', sections: [{ heading: 'Problem', body: 'It fails.' }] })).toBe(
      '## Problem\n\nIt fails.\n',
    );
  });
});

import { parseNoteContent } from '@codeassembly/kb-core/frontmatter';
import { describe, expect, it } from 'vitest';

import { detectStaleness } from '../detect-staleness.ts';

const NOW = new Date('2026-05-29T00:00:00Z');

function note(extraFrontmatter: string): ReturnType<typeof parseNoteContent> {
  const content = `---\ntitle: A\ntype: howto\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [x]\n${extraFrontmatter}---\n\nBody.\n`;
  return parseNoteContent({ content, path: 'Note.md' });
}

describe(detectStaleness, () => {
  it('flags verification.unmarked when last-verified is absent', () => {
    const findings = detectStaleness({ note: note(''), now: NOW, staleAfterDays: 90 });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('verification.unmarked');
    expect(findings[0]?.severity).toBe('warning');
  });

  it('flags verification.stale when last-verified is older than the threshold', () => {
    const findings = detectStaleness({ note: note('last-verified: 2026-01-01\n'), now: NOW, staleAfterDays: 90 });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('verification.stale');
    expect(findings[0]?.severity).toBe('warning');
  });

  it('produces no finding when last-verified is within the threshold', () => {
    const findings = detectStaleness({ note: note('last-verified: 2026-05-20\n'), now: NOW, staleAfterDays: 90 });

    expect(findings).toEqual([]);
  });

  it('honors a custom --stale-after threshold', () => {
    const recent = note('last-verified: 2026-05-20\n');

    expect(detectStaleness({ note: recent, now: NOW, staleAfterDays: 90 })).toEqual([]);
    expect(detectStaleness({ note: recent, now: NOW, staleAfterDays: 5 })[0]?.rule).toBe('verification.stale');
  });

  it('treats a malformed-frontmatter note as unmarked', () => {
    const broken = parseNoteContent({ content: '---\ntitle: [bad\n---\n\nBody.\n', path: 'Broken.md' });

    expect(detectStaleness({ note: broken, now: NOW, staleAfterDays: 90 })[0]?.rule).toBe('verification.unmarked');
  });
});

import { parseNoteContent } from '@codeassembly/kb-core/frontmatter';
import { describe, expect, it } from 'vitest';

import { detectStaleness, vaultUsesVerification } from '../detect-staleness.ts';

const NOW = new Date('2026-05-29T00:00:00Z');

function note(extraFrontmatter: string): ReturnType<typeof parseNoteContent> {
  const content = `---\ntitle: A\ntype: howto\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [x]\n${extraFrontmatter}---\n\nBody.\n`;
  return parseNoteContent({ content, path: 'Note.md' });
}

describe(detectStaleness, () => {
  it('flags verification.unmarked when last-verified is absent and the vault uses verification', () => {
    const findings = detectStaleness({ note: note(''), now: NOW, staleAfterDays: 90, vaultUsesVerification: true });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('verification.unmarked');
    expect(findings[0]?.severity).toBe('warning');
  });

  it('does not flag verification.unmarked when the vault does not use verification', () => {
    const findings = detectStaleness({ note: note(''), now: NOW, staleAfterDays: 90, vaultUsesVerification: false });

    expect(findings).toEqual([]);
  });

  it('flags verification.stale regardless of whether the vault uses verification', () => {
    const stale = note('last-verified: 2026-01-01\n');

    for (const vaultUsesVerification of [true, false]) {
      const findings = detectStaleness({ note: stale, now: NOW, staleAfterDays: 90, vaultUsesVerification });

      expect(findings).toHaveLength(1);
      expect(findings[0]?.rule).toBe('verification.stale');
      expect(findings[0]?.severity).toBe('warning');
    }
  });

  it('produces no finding when last-verified is within the threshold', () => {
    const findings = detectStaleness({
      note: note('last-verified: 2026-05-20\n'),
      now: NOW,
      staleAfterDays: 90,
      vaultUsesVerification: true,
    });

    expect(findings).toEqual([]);
  });

  it('honors a custom --stale-after threshold', () => {
    const recent = note('last-verified: 2026-05-20\n');

    expect(detectStaleness({ note: recent, now: NOW, staleAfterDays: 90, vaultUsesVerification: true })).toEqual([]);
    expect(detectStaleness({ note: recent, now: NOW, staleAfterDays: 5, vaultUsesVerification: true })[0]?.rule).toBe(
      'verification.stale',
    );
  });

  it('flags verification.unmarked when last-verified is present but not a parseable date', () => {
    const findings = detectStaleness({
      note: note('last-verified: not-a-date\n'),
      now: NOW,
      staleAfterDays: 90,
      vaultUsesVerification: true,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('verification.unmarked');
  });

  it('treats a malformed-frontmatter note as unmarked when the vault uses verification', () => {
    const broken = parseNoteContent({ content: '---\ntitle: [bad\n---\n\nBody.\n', path: 'Broken.md' });

    expect(detectStaleness({ note: broken, now: NOW, staleAfterDays: 90, vaultUsesVerification: true })[0]?.rule).toBe(
      'verification.unmarked',
    );
  });
});

describe(vaultUsesVerification, () => {
  it('returns false when no note carries a last-verified value', () => {
    expect(vaultUsesVerification([note(''), note('')], NOW)).toBe(false);
  });

  it('returns true when at least one note carries a parseable last-verified value', () => {
    expect(vaultUsesVerification([note(''), note('last-verified: 2026-05-20\n')], NOW)).toBe(true);
  });

  it('returns false when the only last-verified value is unparseable', () => {
    expect(vaultUsesVerification([note(''), note('last-verified: not-a-date\n')], NOW)).toBe(false);
  });
});

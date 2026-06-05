import type { ParsedNote } from '@codeassembly/kb';
import { parseNoteContent } from '@codeassembly/kb/frontmatter';
import { describe, expect, it } from 'vitest';

import { detectSupersede } from '../detect-supersede.ts';

const ROOT = '/vault';

/** Builds a note at `/vault/<name>.md` with optional `superseded-by` / `supersedes` references. */
function note(name: string, refs: { supersededBy?: string; supersedes?: string } = {}): ParsedNote {
  const lines = ['---', `title: ${name}`, 'type: howto', 'created: 2026-01-01', 'updated: 2026-01-01', 'tags: [x]'];
  if (refs.supersededBy !== undefined) lines.push(`superseded-by: ${refs.supersededBy}`);
  if (refs.supersedes !== undefined) lines.push(`supersedes: ${refs.supersedes}`);
  lines.push('---', '', 'Body.', '');
  return parseNoteContent({ content: lines.join('\n'), path: `${ROOT}/${name}.md` });
}

function rules(notes: ParsedNote[]): string[] {
  return detectSupersede(notes).map((finding) => finding.rule);
}

describe(detectSupersede, () => {
  it('produces no finding for a clean symmetric supersession', () => {
    const old = note('Old', { supersededBy: 'New.md' });
    const fresh = note('New', { supersedes: 'Old.md' });

    expect(detectSupersede([old, fresh])).toEqual([]);
  });

  it('flags supersede.dangling when superseded-by points outside the vault', () => {
    const findings = detectSupersede([note('Old', { supersededBy: 'Missing.md' })]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('supersede.dangling');
    expect(findings[0]?.severity).toBe('error');
  });

  it('flags supersede.dangling referencing the supersedes field when supersedes points outside the vault', () => {
    const findings = detectSupersede([note('New', { supersedes: 'Gone.md' })]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('supersede.dangling');
    expect(findings[0]?.severity).toBe('error');
    expect(findings[0]?.message).toContain('supersedes');
  });

  it('flags supersede.asymmetric when the successor does not point back', () => {
    const old = note('Old', { supersededBy: 'New.md' });
    const fresh = note('New');

    const findings = detectSupersede([old, fresh]);

    expect(findings.map((finding) => finding.rule)).toEqual(['supersede.asymmetric']);
    expect(findings[0]?.severity).toBe('warning');
  });

  it('flags supersede.cycle on every member of a superseded-by loop', () => {
    const a = note('A', { supersededBy: 'B.md' });
    const b = note('B', { supersededBy: 'A.md' });

    const findings = detectSupersede([a, b]);
    const cycleFindings = findings.filter((finding) => finding.rule === 'supersede.cycle');

    expect(cycleFindings).toHaveLength(2);
    expect(cycleFindings.every((finding) => finding.severity === 'error')).toBe(true);
  });

  it('does not flag a cycle through a dangling edge', () => {
    expect(rules([note('A', { supersededBy: 'Gone.md' })])).toEqual(['supersede.dangling']);
  });
});

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import type { AliasMap } from '../../types.ts';
import { frontmatterRule } from '../frontmatter-rule.ts';
import { runRules } from '../run-rules.ts';
import { tagAliasRule } from '../tag-alias-rule.ts';

const ALIASES: AliasMap = new Map([['vcs', 'git']]);

const VALID_NOTE = [
  '---',
  'title: Valid note',
  'recordType: assertion',
  'created: 2026-05-01T09:38:14Z',
  'updated: 2026-05-14T14:55:02Z',
  'tags: [vcs]',
  '---',
  '',
].join('\n');

describe(runRules, () => {
  it('returns an empty array when the rule list is empty', () => {
    const note = parseNoteContent({ content: VALID_NOTE, path: 'note.md' });

    expect(runRules({ rules: [], notes: [note], schema: defaultSchema })).toEqual([]);
  });

  it('returns an empty array when the note list is empty', () => {
    expect(runRules({ rules: [frontmatterRule], notes: [], schema: defaultSchema })).toEqual([]);
  });

  it('concatenates findings across rules for a single note', () => {
    const note = parseNoteContent({ content: VALID_NOTE, path: 'note.md' });
    const findings = runRules({
      rules: [frontmatterRule, tagAliasRule],
      notes: [note],
      schema: defaultSchema,
      aliases: ALIASES,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('frontmatter.tag-alias');
  });

  it('groups all findings for one note before moving to the next', () => {
    const noteA = parseNoteContent({ content: '# no frontmatter A', path: 'a.md' });
    const noteB = parseNoteContent({ content: '# no frontmatter B', path: 'b.md' });
    const findings = runRules({
      rules: [frontmatterRule],
      notes: [noteA, noteB],
      schema: defaultSchema,
    });

    expect(findings.map((finding) => finding.path)).toEqual(['a.md', 'b.md']);
  });

  it('lets the tag-alias rule no-op when no alias map is supplied', () => {
    const note = parseNoteContent({ content: VALID_NOTE, path: 'note.md' });
    const findings = runRules({
      rules: [frontmatterRule, tagAliasRule],
      notes: [note],
      schema: defaultSchema,
    });

    expect(findings).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.js';
import { defaultSchema } from '../../schema/default-schema.js';
import type { AliasMap } from '../../types.js';
import { frontmatterRule } from '../frontmatter-rule.js';
import { runRules } from '../run-rules.js';
import { tagAliasRule } from '../tag-alias-rule.js';

const ALIASES: AliasMap = new Map([['vcs', 'git']]);

const VALID_NOTE = [
  '---',
  'title: Valid note',
  'type: howto',
  'created: 2026-05-01',
  'updated: 2026-05-14',
  'tags: [vcs]',
  '---',
  '',
].join('\n');

describe(runRules, () => {
  it('returns an empty array when the rule list is empty', () => {
    const note = parseNoteContent(VALID_NOTE, 'note.md');

    expect(runRules({ rules: [], notes: [note], schema: defaultSchema })).toEqual([]);
  });

  it('returns an empty array when the note list is empty', () => {
    expect(runRules({ rules: [frontmatterRule], notes: [], schema: defaultSchema })).toEqual([]);
  });

  it('concatenates findings across rules for a single note', () => {
    const note = parseNoteContent(VALID_NOTE, 'note.md');
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
    const noteA = parseNoteContent('# no frontmatter A', 'a.md');
    const noteB = parseNoteContent('# no frontmatter B', 'b.md');
    const findings = runRules({
      rules: [frontmatterRule],
      notes: [noteA, noteB],
      schema: defaultSchema,
    });

    expect(findings.map((finding) => finding.path)).toEqual(['a.md', 'b.md']);
  });

  it('lets the tag-alias rule no-op when no alias map is supplied', () => {
    const note = parseNoteContent(VALID_NOTE, 'note.md');
    const findings = runRules({
      rules: [frontmatterRule, tagAliasRule],
      notes: [note],
      schema: defaultSchema,
    });

    expect(findings).toEqual([]);
  });
});

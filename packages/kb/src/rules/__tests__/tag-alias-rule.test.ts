import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteWithDocument } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import type { AliasMap, Finding } from '../../types.ts';
import { tagAliasRule } from '../tag-alias-rule.ts';

const RULE_CASES_DIR = join(import.meta.dirname, 'fixtures', 'rule-cases');

const ALIASES: AliasMap = new Map([
  ['vcs', 'git'],
  ['version-control', 'git'],
  ['reactjs', 'react'],
]);

async function checkFixture(name: string, aliases?: AliasMap): Promise<Finding[]> {
  const content = await readFile(join(RULE_CASES_DIR, `${name}.md`), 'utf8');
  const { note, document } = parseNoteWithDocument(content, `${name}.md`);
  return tagAliasRule.check({ note, document, schema: defaultSchema, ...(aliases !== undefined && { aliases }) });
}

describe('tagAliasRule', () => {
  it('emits a warning for each aliased tag in YAML-list order', async () => {
    const findings = await checkFixture('aliased-tag', ALIASES);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      path: 'aliased-tag.md',
      line: 6,
      rule: 'frontmatter.tag-alias',
      severity: 'warning',
      message: 'tag "vcs" is an alias — use canonical form "git"',
    });
  });

  it('no-ops when no alias map is supplied', async () => {
    const findings = await checkFixture('aliased-tag');

    expect(findings).toEqual([]);
  });

  it('produces no findings when every tag is already canonical', () => {
    const content = [
      '---',
      'title: Canonical tags',
      'recordType: assertion',
      'created: 2026-05-01',
      'updated: 2026-05-14',
      'tags: [git, react]',
      '---',
      '',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'canonical.md');

    expect(tagAliasRule.check({ note, document, schema: defaultSchema, aliases: ALIASES })).toEqual([]);
  });

  it('emits one warning per aliased tag when several aliases appear', () => {
    const content = [
      '---',
      'title: Multiple aliases',
      'recordType: assertion',
      'created: 2026-05-01',
      'updated: 2026-05-14',
      'tags: [vcs, version-control, react]',
      '---',
      '',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'multi.md');
    const findings = tagAliasRule.check({ note, document, schema: defaultSchema, aliases: ALIASES });

    expect(findings.map((finding) => finding.message)).toEqual([
      'tag "vcs" is an alias — use canonical form "git"',
      'tag "version-control" is an alias — use canonical form "git"',
    ]);
  });

  it('defers to the frontmatter rule when the tags field is not a list', async () => {
    const findings = await checkFixture('tags-not-list', ALIASES);

    expect(findings).toEqual([]);
  });

  it('no-ops on a note with no frontmatter block', async () => {
    const findings = await checkFixture('missing-frontmatter', ALIASES);

    expect(findings).toEqual([]);
  });

  it('no-ops when the frontmatter block has a YAML parse error', async () => {
    const findings = await checkFixture('malformed-yaml', ALIASES);

    expect(findings).toEqual([]);
  });
});

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.js';
import { defaultSchema } from '../../schema/default-schema.js';
import { parseAliases } from '../../tags/load-aliases.js';
import type { Finding } from '../../types.js';
import { frontmatterRule } from '../frontmatter-rule.js';
import { runRules } from '../run-rules.js';
import { tagAliasRule } from '../tag-alias-rule.js';

const PARITY_DIR = join(import.meta.dirname, 'fixtures', 'parity');
const NOTES_DIR = join(PARITY_DIR, 'notes');

/** Sort findings by path, then line, then rule, for stable comparison. */
function normalize(findings: readonly Finding[]): Finding[] {
  return findings.toSorted((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) return lineA - lineB;
    if (a.rule === b.rule) return 0;
    return a.rule < b.rule ? -1 : 1;
  });
}

describe('rules parity with the vault check-notes golden', () => {
  it('produces exactly the findings recorded in expected-findings.json', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));
    const aliases = parseAliases(await readFile(join(PARITY_DIR, 'tag-aliases.yaml'), 'utf8'));

    const noteFiles = (await readdir(NOTES_DIR)).filter((name) => name.endsWith('.md')).toSorted();
    const notes = await Promise.all(
      noteFiles.map(async (name) => parseNoteContent(await readFile(join(NOTES_DIR, name), 'utf8'), name)),
    );

    const actual = runRules({
      rules: [frontmatterRule, tagAliasRule],
      notes,
      schema: defaultSchema,
      aliases,
    });

    expect(normalize(actual)).toEqual(normalize(expected));
  });

  it('exercises every frontmatter rule code in the golden', async () => {
    const expected: Finding[] = JSON.parse(await readFile(join(PARITY_DIR, 'expected-findings.json'), 'utf8'));
    const codes = new Set(expected.map((finding) => finding.rule));

    expect(codes).toEqual(
      new Set([
        'frontmatter.missing',
        'frontmatter.parse',
        'frontmatter.empty',
        'frontmatter.required',
        'frontmatter.type',
        'frontmatter.date',
        'frontmatter.tags',
        'frontmatter.tag-alias',
      ]),
    );
  });
});

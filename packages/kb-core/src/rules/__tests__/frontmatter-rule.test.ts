import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteWithDocument } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import type { Finding } from '../../types.ts';
import { frontmatterRule } from '../frontmatter-rule.ts';

const RULE_CASES_DIR = join(import.meta.dirname, 'fixtures', 'rule-cases');

async function checkFixture(name: string): Promise<Finding[]> {
  const content = await readFile(join(RULE_CASES_DIR, `${name}.md`), 'utf8');
  const { note, document } = parseNoteWithDocument(content, `${name}.md`);
  return frontmatterRule.check({ note, document, schema: defaultSchema });
}

describe('frontmatterRule', () => {
  it('emits frontmatter.missing when a note has no frontmatter block', async () => {
    const findings = await checkFixture('missing-frontmatter');

    expect(findings).toEqual([
      {
        path: 'missing-frontmatter.md',
        line: 1,
        rule: 'frontmatter.missing',
        severity: 'error',
        message: 'no frontmatter block found',
      },
    ]);
  });

  it('emits only frontmatter.parse and stops when the YAML is malformed', async () => {
    const findings = await checkFixture('malformed-yaml');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('frontmatter.parse');
    expect(findings[0]?.severity).toBe('error');
  });

  it('emits frontmatter.empty when the frontmatter block has no content', async () => {
    const findings = await checkFixture('empty-block');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe('frontmatter.empty');
  });

  it('emits one frontmatter.required finding per missing required field', async () => {
    const findings = await checkFixture('missing-required');
    const required = findings.filter((finding) => finding.rule === 'frontmatter.required');

    expect(required).toHaveLength(2);
    expect(required.map((finding) => finding.message)).toEqual([
      'missing required field: created',
      'missing required field: updated',
    ]);
  });

  it('reports missing required fields at the end-of-frontmatter line', async () => {
    const findings = await checkFixture('missing-required');
    const required = findings.filter((finding) => finding.rule === 'frontmatter.required');

    for (const finding of required) {
      expect(finding.line).toBe(5);
    }
  });

  it('emits frontmatter.type when the type is not in the schema vocabulary', async () => {
    const findings = await checkFixture('unknown-type');
    const typeFinding = findings.find((finding) => finding.rule === 'frontmatter.type');

    expect(typeFinding?.message).toContain('postmortem');
    expect(typeFinding?.line).toBe(3);
  });

  it('emits frontmatter.date for a date field that is not a real calendar date', async () => {
    const findings = await checkFixture('bad-date');
    const dateFinding = findings.find((finding) => finding.rule === 'frontmatter.date');

    expect(dateFinding?.message).toMatch(/created:/);
    expect(dateFinding?.line).toBe(4);
  });

  it('emits frontmatter.tags when the tags field is not a list', async () => {
    const findings = await checkFixture('tags-not-list');
    const tagsFinding = findings.find((finding) => finding.rule === 'frontmatter.tags');

    expect(tagsFinding?.message).toBe('tags must be a list');
    expect(tagsFinding?.line).toBe(6);
  });

  it('produces no findings for a well-formed note', () => {
    const content = [
      '---',
      'title: Valid note',
      'type: howto',
      'created: 2026-05-01',
      'updated: 2026-05-14',
      'tags: [git]',
      '---',
      '',
      '# Body',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'valid.md');

    expect(frontmatterRule.check({ note, document, schema: defaultSchema })).toEqual([]);
  });
});

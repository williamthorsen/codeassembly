import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNoteWithDocument } from '../../frontmatter/parse-note.ts';
import { defaultSchema } from '../../schema/default-schema.ts';
import { loadSchema } from '../../schema/load-schema.ts';
import type { Finding, KbRoot, Schema } from '../../types.ts';
import { frontmatterRule } from '../frontmatter-rule.ts';

const RULE_CASES_DIR = join(import.meta.dirname, 'fixtures', 'rule-cases');

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

  it('emits frontmatter.recordType when the recordType is not in the schema vocabulary', async () => {
    const findings = await checkFixture('unknown-record-type');
    const recordTypeFinding = findings.find((finding) => finding.rule === 'frontmatter.recordType');

    expect(recordTypeFinding?.message).toContain('postmortem');
    expect(recordTypeFinding?.line).toBe(3);
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

  it.each([['addressed-by'], ['addresses']])(
    'emits frontmatter.list when %s is a scalar rather than a list',
    (field) => {
      const content = [
        '---',
        'title: Relation field under test',
        'recordType: assertion',
        'created: 2026-05-01T08:33:51Z',
        'updated: 2026-05-14T15:42:18Z',
        'tags: [git]',
        `${field}: a-single-ref`,
        '---',
        '',
        '# Body',
      ].join('\n');
      const { note, document } = parseNoteWithDocument(content, 'relation-field.md');

      const listFinding = frontmatterRule
        .check({ note, document, schema: defaultSchema })
        .find((finding) => finding.rule === 'frontmatter.list');

      expect(listFinding?.message).toBe(`${field} must be a list`);
    },
  );

  it('produces no findings for an assertion whose addressed-by and addresses are lists', () => {
    const content = [
      '---',
      'title: Note with relation lists',
      'recordType: assertion',
      'created: 2026-05-01T08:33:51Z',
      'updated: 2026-05-14T15:42:18Z',
      'tags: [git]',
      "addressed-by: ['abc1234', 'owner/repo#42']",
      "addresses: ['../problem.md']",
      '---',
      '',
      '# Body',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'relation-lists.md');

    expect(frontmatterRule.check({ note, document, schema: defaultSchema })).toEqual([]);
  });

  it('produces no findings for a well-formed assertion note', () => {
    const content = [
      '---',
      'title: Valid note',
      'recordType: assertion',
      'created: 2026-05-01T08:33:51Z',
      'updated: 2026-05-14T15:42:18Z',
      'tags: [git]',
      '---',
      '',
      '# Body',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'valid.md');

    expect(frontmatterRule.check({ note, document, schema: defaultSchema })).toEqual([]);
  });

  it('accepts a second-precision UTC timestamp in a date field', () => {
    const dateFinding = checkDateField('created', '2026-05-01T14:35:09Z').find(
      (finding) => finding.rule === 'frontmatter.date',
    );

    expect(dateFinding).toBeUndefined();
  });

  it.each([
    ['created', 'date without a Z marker', '2026-05-01T14:35:09', 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got'],
    [
      'created',
      'date with a numeric offset',
      '2026-05-01T14:35:09+00:00',
      'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got',
    ],
    ['created', 'slash-separated date', '2026/05/01', 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got'],
    ['created', 'unreal calendar date', '2026-02-30', 'is not a real calendar date'],
    ['created', 'unreal clock time', '2026-05-01T25:00:00Z', 'is not a real timestamp'],
    ['updated', 'unreal calendar date', '2026-02-30', 'is not a real calendar date'],
  ] as const)('rejects %s as a %s', (field, _label, value, expectedMessage) => {
    const dateFinding = checkDateField(field, value).find((finding) => finding.rule === 'frontmatter.date');

    expect(dateFinding?.message).toContain(expectedMessage);
  });

  it('accepts a bare date in the last-verified field', () => {
    const dateFinding = checkDateField('last-verified', '2026-05-14').find(
      (finding) => finding.rule === 'frontmatter.date',
    );

    expect(dateFinding).toBeUndefined();
  });

  it('accepts a second-precision UTC timestamp in the last-verified field', () => {
    const dateFinding = checkDateField('last-verified', '2026-05-14T14:35:09Z').find(
      (finding) => finding.rule === 'frontmatter.date',
    );

    expect(dateFinding).toBeUndefined();
  });

  it.each([
    ['date without a Z marker', '2026-05-14T14:35:09', 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got'],
    ['date with a numeric offset', '2026-05-14T14:35:09+00:00', 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got'],
    ['unreal calendar date', '2026-02-30', 'is not a real calendar date'],
    ['unreal clock time', '2026-05-14T25:00:00Z', 'is not a real timestamp'],
  ])('rejects %s in the last-verified field', (_label, value, expectedMessage) => {
    const dateFinding = checkDateField('last-verified', value).find((finding) => finding.rule === 'frontmatter.date');

    expect(dateFinding?.message).toContain(expectedMessage);
  });

  it('emits frontmatter.recordType when the recordType field is absent', () => {
    const content = [
      '---',
      'title: Note with no recordType',
      'created: 2026-05-01T08:33:51Z',
      'updated: 2026-05-14T15:42:18Z',
      'tags: [git]',
      '---',
      '',
      '# Body',
    ].join('\n');
    const { note, document } = parseNoteWithDocument(content, 'no-record-type.md');

    const recordTypeFinding = frontmatterRule
      .check({ note, document, schema: defaultSchema })
      .find((finding) => finding.rule === 'frontmatter.recordType');

    expect(recordTypeFinding?.message).toBe('missing recordType');
  });
});

describe('frontmatterRule across record types', () => {
  function recordTypesSchema(): Promise<Schema> {
    const path = join(import.meta.dirname, '..', '..', 'schema', '__tests__', 'fixtures', 'record-types');
    const kbRoot: KbRoot = { path, kbDir: join(path, '.kb'), via: 'ancestor-walk' };
    return loadSchema({ kbRoot });
  }

  function checkAgainst(content: string, schema: Schema): Finding[] {
    const { note, document } = parseNoteWithDocument(content, 'record.md');
    return frontmatterRule.check({ note, document, schema });
  }

  it('rejects an assertion missing a spine field', async () => {
    const schema = await recordTypesSchema();
    const content = ['---', 'recordType: assertion', 'title: Missing dates and tags', '---', '', '# Body'].join('\n');

    const required = checkAgainst(content, schema)
      .filter((finding) => finding.rule === 'frontmatter.required')
      .map((finding) => finding.message);

    expect(required).toEqual([
      'missing required field: created',
      'missing required field: updated',
      'missing required field: tags',
    ]);
  });

  it('rejects an event missing a spine field', async () => {
    const schema = await recordTypesSchema();
    const content = [
      '---',
      'recordType: event',
      'id: 01HZ',
      'captured-at: 2026-06-04T00:00:00Z',
      'session: abc',
      'cwd: /tmp',
      '---',
      '',
      '# Body',
    ].join('\n');

    const required = checkAgainst(content, schema)
      .filter((finding) => finding.rule === 'frontmatter.required')
      .map((finding) => finding.message);

    expect(required).toEqual(['missing required field: summary']);
  });

  it('accepts a valid event with no title or created fields', async () => {
    const schema = await recordTypesSchema();
    const content = [
      '---',
      'recordType: event',
      'id: 01HZ',
      'captured-at: 2026-06-04T00:00:00Z',
      'session: abc',
      'cwd: /tmp',
      'summary: Something noticed',
      '---',
      '',
      '# Body',
    ].join('\n');

    expect(checkAgainst(content, schema)).toEqual([]);
  });

  it('does not require updated for the event record type', async () => {
    const schema = await recordTypesSchema();
    const content = [
      '---',
      'recordType: event',
      'id: 01HZ',
      'captured-at: 2026-06-04T00:00:00Z',
      'session: abc',
      'cwd: /tmp',
      'summary: No updated field present',
      '---',
      '',
      '# Body',
    ].join('\n');

    const required = checkAgainst(content, schema).filter((finding) => finding.rule === 'frontmatter.required');

    expect(required.map((finding) => finding.message)).not.toContain('missing required field: updated');
  });

  it('rejects a recordType not declared by the schema', async () => {
    const schema = await recordTypesSchema();
    const content = [
      '---',
      'recordType: postmortem',
      'id: 01HZ',
      'captured-at: 2026-06-04T00:00:00Z',
      'session: abc',
      'cwd: /tmp',
      'summary: Unknown record type',
      '---',
      '',
      '# Body',
    ].join('\n');

    const recordTypeFinding = checkAgainst(content, schema).find(
      (finding) => finding.rule === 'frontmatter.recordType',
    );

    expect(recordTypeFinding?.message).toContain('postmortem');
  });
});

// region | Helpers

/** Builds a minimal valid assertion note with one date field overridden, then runs the frontmatter rule against it. */
function checkDateField(field: 'created' | 'updated' | 'last-verified', value: string): Finding[] {
  const defaults: Record<'created' | 'updated' | 'last-verified', string> = {
    created: '2026-05-01T08:33:51Z',
    updated: '2026-05-14T15:42:18Z',
    'last-verified': '2026-05-14T11:09:47Z',
  };
  const lines = { ...defaults, [field]: value };
  const content = [
    '---',
    'title: Date field under test',
    'recordType: assertion',
    `created: ${lines.created}`,
    `updated: ${lines.updated}`,
    `last-verified: ${lines['last-verified']}`,
    'tags: [git]',
    '---',
    '',
    '# Body',
  ].join('\n');
  const { note, document } = parseNoteWithDocument(content, 'date-field.md');
  return frontmatterRule.check({ note, document, schema: defaultSchema });
}

async function checkFixture(name: string): Promise<Finding[]> {
  const content = await readFile(join(RULE_CASES_DIR, `${name}.md`), 'utf8');
  const { note, document } = parseNoteWithDocument(content, `${name}.md`);
  return frontmatterRule.check({ note, document, schema: defaultSchema });
}

// endregion | Helpers

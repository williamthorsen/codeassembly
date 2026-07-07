import { describe, expect, it } from 'vitest';

import { parseAssertion, renderAssertion } from '../assertion.ts';

const validFields = {
  recordType: 'assertion',
  title: 'How to rebase onto main',
  created: '2026-05-01T09:22:35Z',
  updated: '2026-05-14T15:08:51Z',
  tags: ['git', 'rebase'],
};

describe(parseAssertion, () => {
  it('parses a well-formed assertion', () => {
    const result = parseAssertion(validFields, '\nThe body.\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.title).toBe('How to rebase onto main');
    expect(result.record.tags).toEqual(['git', 'rebase']);
  });

  it('reports a missing required field', () => {
    const { title: _title, ...withoutTitle } = validFields;
    const result = parseAssertion(withoutTitle, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('title');
  });

  it('rejects an invalid created date', () => {
    const result = parseAssertion({ ...validFields, created: 'last week' }, '');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-list tags value', () => {
    const result = parseAssertion({ ...validFields, tags: 'git' }, '');
    expect(result.ok).toBe(false);
  });

  it('reads last-verified, addressed-by, supersedes, and superseded-by as typed fields, not extra', () => {
    const result = parseAssertion(
      {
        ...validFields,
        'last-verified': '2026-05-14',
        'addressed-by': ['#812'],
        supersedes: 'old-note.md',
        'superseded-by': 'new-note.md',
      },
      '',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.lastVerified).toBe('2026-05-14');
    expect(result.record.addressedBy).toEqual(['#812']);
    expect(result.record.supersedes).toBe('old-note.md');
    expect(result.record.supersededBy).toBe('new-note.md');
    expect(result.record.extra).toEqual({});
  });

  it('defaults addressed-by to an empty list and leaves the optional pointers undefined when absent', () => {
    const result = parseAssertion(validFields, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.addressedBy).toEqual([]);
    expect(result.record.lastVerified).toBeUndefined();
    expect(result.record.supersedes).toBeUndefined();
    expect(result.record.supersededBy).toBeUndefined();
  });

  it('reports a non-list addressed-by', () => {
    const result = parseAssertion({ ...validFields, 'addressed-by': 42 }, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('addressed-by');
  });

  it('rejects an invalid last-verified date', () => {
    const result = parseAssertion({ ...validFields, 'last-verified': 'recently' }, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('last-verified');
  });

  it('rejects a non-string supersedes', () => {
    const result = parseAssertion({ ...validFields, supersedes: 42 }, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('supersedes');
  });

  it('preserves genuinely unknown fields in extra', () => {
    const result = parseAssertion({ ...validFields, sources: ['a'], 'applies-to': 'x' }, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.extra).toEqual({ sources: ['a'], 'applies-to': 'x' });
  });
});

describe(renderAssertion, () => {
  it('round-trips a well-formed assertion through parse', () => {
    const parsed = parseAssertion(
      { ...validFields, 'last-verified': '2026-05-14', 'addressed-by': ['#812'], sources: ['a'] },
      '\nThe body.\n',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { fields, body } = renderAssertion(parsed.record);
    expect(parseAssertion(fields, body)).toEqual(parsed);
  });

  it('omits addressed-by and the optional pointers when unset', () => {
    const parsed = parseAssertion(validFields, '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderAssertion(parsed.record).fields);
    expect(keys).not.toContain('addressed-by');
    expect(keys).not.toContain('last-verified');
    expect(keys).not.toContain('supersedes');
    expect(keys).not.toContain('superseded-by');
  });

  it('emits the typed fields in order after the spine and before extra', () => {
    const parsed = parseAssertion(
      {
        ...validFields,
        'addressed-by': ['#812'],
        'last-verified': '2026-05-14',
        supersedes: 'old-note.md',
        'superseded-by': 'new-note.md',
        sources: ['a'],
      },
      '',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderAssertion(parsed.record).fields);
    expect(keys).toEqual([
      'recordType',
      'title',
      'created',
      'updated',
      'tags',
      'addressed-by',
      'last-verified',
      'supersedes',
      'superseded-by',
      'sources',
    ]);
  });

  it('emits only the assertion fields — never a foreign key', () => {
    const parsed = parseAssertion(validFields, '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderAssertion(parsed.record).fields);
    expect(keys).toEqual(['recordType', 'title', 'created', 'updated', 'tags']);
  });
});

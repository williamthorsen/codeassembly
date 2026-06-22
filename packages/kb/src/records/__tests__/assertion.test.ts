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

  it('preserves unrecognized fields in extra', () => {
    const result = parseAssertion({ ...validFields, 'last-verified': '2026-05-14', sources: ['a'] }, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.extra).toEqual({ 'last-verified': '2026-05-14', sources: ['a'] });
  });
});

describe(renderAssertion, () => {
  it('round-trips a well-formed assertion through parse', () => {
    const parsed = parseAssertion({ ...validFields, 'last-verified': '2026-05-14' }, '\nThe body.\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { fields, body } = renderAssertion(parsed.record);
    expect(parseAssertion(fields, body)).toEqual(parsed);
  });
});

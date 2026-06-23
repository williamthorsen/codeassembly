import { describe, expect, it } from 'vitest';

import { parseEvent, renderEvent } from '../event.ts';

const validFields = {
  recordType: 'event',
  id: '01HZCEVENTAAAAAAAAAAAAAAAA',
  'captured-at': '2026-06-18T09:41:02Z',
  session: 'session-abc',
  cwd: '/tmp/work',
  summary: 'Noticed a phantomwidget glitch',
};

describe(parseEvent, () => {
  it('parses a well-formed event', () => {
    const result = parseEvent(validFields, '\nThe body.\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.id).toBe('01HZCEVENTAAAAAAAAAAAAAAAA');
    expect(result.record.capturedAt).toBe('2026-06-18T09:41:02Z');
  });

  it('reports a missing required field', () => {
    const { summary: _summary, ...withoutSummary } = validFields;
    const result = parseEvent(withoutSummary, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('summary');
  });

  it('rejects an invalid captured-at', () => {
    const result = parseEvent({ ...validFields, 'captured-at': 'whenever' }, '');
    expect(result.ok).toBe(false);
  });

  it('reads tags and addressed-by as typed fields, not extra', () => {
    const result = parseEvent({ ...validFields, tags: ['fix'], 'addressed-by': ['#849'] }, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.tags).toEqual(['fix']);
    expect(result.record.addressedBy).toEqual(['#849']);
    expect(result.record.extra).toEqual({});
  });

  it('defaults tags and addressed-by to empty lists when absent', () => {
    const result = parseEvent(validFields, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.tags).toEqual([]);
    expect(result.record.addressedBy).toEqual([]);
  });

  it('reports a non-list addressed-by', () => {
    const result = parseEvent({ ...validFields, 'addressed-by': 42 }, '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toContain('addressed-by');
  });

  it('preserves unknown fields in extra', () => {
    const result = parseEvent({ ...validFields, repo: 'owner/name' }, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.extra).toEqual({ repo: 'owner/name' });
  });
});

describe(renderEvent, () => {
  it('round-trips a well-formed event through parse', () => {
    const parsed = parseEvent(
      { ...validFields, repo: 'owner/name', tags: ['fix'], 'addressed-by': ['#849'] },
      '\nThe body.\n',
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { fields, body } = renderEvent(parsed.record);
    expect(parseEvent(fields, body)).toEqual(parsed);
  });

  it('omits tags and addressed-by when empty', () => {
    const parsed = parseEvent(validFields, '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderEvent(parsed.record).fields);
    expect(keys).not.toContain('tags');
    expect(keys).not.toContain('addressed-by');
  });

  it('emits tags and addressed-by after the spine and before extra', () => {
    const parsed = parseEvent({ ...validFields, repo: 'owner/name', tags: ['fix'], 'addressed-by': ['#849'] }, '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderEvent(parsed.record).fields);
    expect(keys).toEqual([
      'recordType',
      'id',
      'captured-at',
      'session',
      'cwd',
      'summary',
      'tags',
      'addressed-by',
      'repo',
    ]);
  });

  it('emits only the event fields — never title, created, or updated', () => {
    const parsed = parseEvent(validFields, '');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const keys = Object.keys(renderEvent(parsed.record).fields);
    expect(keys).not.toContain('title');
    expect(keys).not.toContain('created');
    expect(keys).not.toContain('updated');
  });
});

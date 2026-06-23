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

  it('preserves optional fields in extra', () => {
    const result = parseEvent({ ...validFields, repo: 'owner/name', 'addressed-by': ['#849'] }, '');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.extra).toEqual({ repo: 'owner/name', 'addressed-by': ['#849'] });
  });
});

describe(renderEvent, () => {
  it('round-trips a well-formed event through parse', () => {
    const parsed = parseEvent({ ...validFields, repo: 'owner/name' }, '\nThe body.\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { fields, body } = renderEvent(parsed.record);
    expect(parseEvent(fields, body)).toEqual(parsed);
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

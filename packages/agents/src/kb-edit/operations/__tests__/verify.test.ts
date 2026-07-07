import type { KbAssertion } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { verify } from '../verify.ts';

const NOW = new Date('2026-05-24T14:35:00Z');

/** Builds a baseline assertion record for the operation under test, with overrides merged in. */
function buildAssertion(overrides: Partial<KbAssertion> = {}): KbAssertion {
  return {
    recordType: 'assertion',
    title: 'Example',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['example'],
    addressedBy: [],
    extra: {},
    body: 'body',
    ...overrides,
  };
}

describe(verify, () => {
  it('sets last-verified to today (UTC) and does not bump updated', () => {
    const result = verify(buildAssertion(), NOW);

    expect(result.lastVerified).toBe('2026-05-24T14:35:00Z');
    expect(result.updated).toBe('2026-05-01T08:17:23Z');
  });

  it('sets last-verified when the field is absent', () => {
    const result = verify(buildAssertion(), NOW);

    expect(result.lastVerified).toBe('2026-05-24T14:35:00Z');
  });

  it('overwrites an existing last-verified value', () => {
    const result = verify(buildAssertion({ lastVerified: '2026-01-15T11:42:09Z' }), NOW);

    expect(result.lastVerified).toBe('2026-05-24T14:35:00Z');
  });

  it('preserves other fields when setting last-verified', () => {
    const result = verify(buildAssertion({ extra: { 'applies-to': 'node 24', sources: ['docs.example.com'] } }), NOW);

    expect(result.extra).toEqual({ 'applies-to': 'node 24', sources: ['docs.example.com'] });
  });

  it('advances a born-verified note last-verified to an instant at or after created', () => {
    const born = '2026-05-01T09:00:00Z';
    const result = verify(buildAssertion({ created: born, updated: born, lastVerified: born }), NOW);

    expect(result.lastVerified).toBe('2026-05-24T14:35:00Z');
    expect(Date.parse(String(result.lastVerified))).toBeGreaterThanOrEqual(Date.parse(result.created));
  });

  it('does not mutate the input record', () => {
    const record = buildAssertion();

    verify(record, NOW);

    expect(record.lastVerified).toBeUndefined();
  });
});

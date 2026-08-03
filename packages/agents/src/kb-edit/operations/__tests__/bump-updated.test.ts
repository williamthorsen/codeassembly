import type { KbAssertion } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { bumpUpdated } from '../bump-updated.ts';

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

describe(bumpUpdated, () => {
  it('sets updated to today (UTC) and leaves other fields untouched', () => {
    const result = bumpUpdated(buildAssertion({ body: 'unchanged body' }), NOW);

    expect(result.updated).toBe('2026-05-24T14:35:00Z');
    expect(result.title).toBe('Example');
    expect(result.created).toBe('2026-05-01T08:17:23Z');
    expect(result.tags).toEqual(['example']);
    expect(result.body).toBe('unchanged body');
  });

  it('preserves last-verified and other fields', () => {
    const result = bumpUpdated(
      buildAssertion({ lastVerified: '2026-05-10T16:05:47Z', extra: { 'applies-to': 'node 24' } }),
      NOW,
    );

    expect(result.lastVerified).toBe('2026-05-10T16:05:47Z');
    expect(result.extra).toEqual({ 'applies-to': 'node 24' });
  });

  it('does not mutate the input record', () => {
    const record = buildAssertion();

    bumpUpdated(record, NOW);

    expect(record.updated).toBe('2026-05-01T08:17:23Z');
  });
});

import type { KbAssertion } from '@williamthorsen/kb/records';
import { describe, expect, it } from 'vitest';

import { append } from '../append.ts';

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

describe(append, () => {
  it('appends the addition after a separating blank line and bumps updated', () => {
    const result = append(buildAssertion({ body: 'First paragraph.' }), 'Second paragraph.', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.body).toBe('First paragraph.\n\nSecond paragraph.\n');
      expect(result.record.updated).toBe('2026-05-24T14:35:00Z');
    }
  });

  it('trims trailing whitespace from the existing body before appending', () => {
    const result = append(buildAssertion({ body: 'First paragraph.\n\n\n' }), 'Second paragraph.', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.body).toBe('First paragraph.\n\nSecond paragraph.\n');
    }
  });

  it('trims trailing whitespace from the addition', () => {
    const result = append(buildAssertion({ body: 'First.' }), 'Second paragraph.\n\n', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.body).toBe('First.\n\nSecond paragraph.\n');
    }
  });

  it('handles an empty existing body', () => {
    const result = append(buildAssertion({ body: '' }), 'New content.', NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.body).toBe('\n\nNew content.\n');
    }
  });

  it('rejects empty stdin with empty-addition', () => {
    const result = append(buildAssertion({ body: 'body' }), '', NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty-addition');
    }
  });

  it('rejects whitespace-only stdin with empty-addition', () => {
    const result = append(buildAssertion({ body: 'body' }), '   \n\n  ', NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty-addition');
    }
  });
});

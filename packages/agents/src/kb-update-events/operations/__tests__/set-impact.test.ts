import type { KbEvent } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { setImpact } from '../set-impact.ts';

/** Builds a minimal valid event record, overridable per test. */
function makeEvent(overrides: Partial<KbEvent> = {}): KbEvent {
  return {
    recordType: 'event',
    id: '01HZCEVENTAAAAAAAAAAAAAAAA',
    capturedAt: '2026-06-18T09:41:02Z',
    session: 'session-abc',
    cwd: '/tmp/work',
    summary: 'Noticed a thing',
    tags: [],
    addressedBy: [],
    extra: {},
    body: 'Body.',
    ...overrides,
  };
}

describe(setImpact, () => {
  it('sets the impact on an unrated event', () => {
    const result = setImpact(makeEvent(), 'high');
    expect(result.impact).toBe('high');
  });

  it('overwrites a prior impact', () => {
    const result = setImpact(makeEvent({ impact: 'low' }), 'critical');
    expect(result.impact).toBe('critical');
  });

  it('leaves tags, addressedBy, and extra unchanged', () => {
    const result = setImpact(
      makeEvent({ tags: ['fix'], addressedBy: ['#789'], extra: { repo: 'owner/name' } }),
      'medium',
    );
    expect(result.tags).toEqual(['fix']);
    expect(result.addressedBy).toEqual(['#789']);
    expect(result.extra).toEqual({ repo: 'owner/name' });
  });

  it('does not mutate the input record', () => {
    const input = makeEvent({ impact: 'low' });
    setImpact(input, 'high');
    expect(input.impact).toBe('low');
  });
});

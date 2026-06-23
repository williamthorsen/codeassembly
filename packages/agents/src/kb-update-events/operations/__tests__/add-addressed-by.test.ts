import type { KbEvent } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { addAddressedBy } from '../add-addressed-by.ts';

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

describe(addAddressedBy, () => {
  it('adds references when addressedBy is empty', () => {
    const result = addAddressedBy(makeEvent(), ['[[fix]]']);
    expect(result.addressedBy).toEqual(['[[fix]]']);
  });

  it('appends to existing entries, preserving order', () => {
    const result = addAddressedBy(makeEvent({ addressedBy: ['#789'] }), ['[[fix]]', 'commit-abc']);
    expect(result.addressedBy).toEqual(['#789', '[[fix]]', 'commit-abc']);
  });

  it('de-duplicates against existing entries in first-occurrence order', () => {
    const result = addAddressedBy(makeEvent({ addressedBy: ['#789', '[[fix]]'] }), ['[[fix]]', '#999']);
    expect(result.addressedBy).toEqual(['#789', '[[fix]]', '#999']);
  });

  it('de-duplicates references supplied in the same call', () => {
    const result = addAddressedBy(makeEvent(), ['[[fix]]', '[[fix]]']);
    expect(result.addressedBy).toEqual(['[[fix]]']);
  });

  it('leaves tags and extra unchanged', () => {
    const result = addAddressedBy(makeEvent({ tags: ['observation'], extra: { repo: 'owner/name' } }), ['[[fix]]']);
    expect(result.tags).toEqual(['observation']);
    expect(result.extra).toEqual({ repo: 'owner/name' });
  });

  it('does not mutate the input record', () => {
    const input = makeEvent({ addressedBy: ['#789'] });
    addAddressedBy(input, ['[[fix]]']);
    expect(input.addressedBy).toEqual(['#789']);
  });
});

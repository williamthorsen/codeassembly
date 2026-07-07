import type { KbAssertion } from '@codeassembly/kb/records';
import { describe, expect, it } from 'vitest';

import { addAddressedBy } from '../add-addressed-by.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

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

describe(addAddressedBy, () => {
  it('adds to the addressed-by list when empty and bumps updated', () => {
    const result = addAddressedBy(buildAssertion(), ['[[fix]]'], NOW);

    expect(result.addressedBy).toEqual(['[[fix]]']);
    expect(result.updated).toBe(TODAY);
    expect(result.body).toBe('body');
  });

  it('appends to existing entries, preserving order', () => {
    const result = addAddressedBy(buildAssertion({ addressedBy: ['#789'] }), ['[[fix]]', 'commit-abc'], NOW);

    expect(result.addressedBy).toEqual(['#789', '[[fix]]', 'commit-abc']);
  });

  it('de-duplicates against existing entries in first-occurrence order', () => {
    const result = addAddressedBy(buildAssertion({ addressedBy: ['#789', '[[fix]]'] }), ['[[fix]]', '#999'], NOW);

    expect(result.addressedBy).toEqual(['#789', '[[fix]]', '#999']);
  });

  it('de-duplicates references supplied in the same call', () => {
    const result = addAddressedBy(buildAssertion(), ['[[fix]]', '[[fix]]'], NOW);

    expect(result.addressedBy).toEqual(['[[fix]]']);
  });

  it('preserves other fields', () => {
    const result = addAddressedBy(buildAssertion({ extra: { diataxis: 'howto' } }), ['[[fix]]'], NOW);

    expect(result.extra.diataxis).toBe('howto');
  });

  it('does not mutate the input record', () => {
    const record = buildAssertion({ addressedBy: ['#789'] });

    addAddressedBy(record, ['[[fix]]'], NOW);

    expect(record.addressedBy).toEqual(['#789']);
    expect(record.updated).toBe('2026-05-01T08:17:23Z');
  });
});

import type { Frontmatter } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { addAddressedBy } from '../add-addressed-by.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const TODAY = '2026-05-24T14:35:00Z';

function frontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Example',
    recordType: 'event',
    created: '2026-05-01',
    updated: '2026-05-01',
    tags: ['example'],
    extra: {},
    ...overrides,
  };
}

describe(addAddressedBy, () => {
  it('creates the addressed-by field when absent and bumps updated', () => {
    const result = addAddressedBy({ frontmatter: frontmatter(), body: 'b', references: ['[[fix]]'], now: NOW });

    expect(result.frontmatter.extra['addressed-by']).toEqual(['[[fix]]']);
    expect(result.frontmatter.updated).toBe(TODAY);
    expect(result.body).toBe('b');
  });

  it('appends to existing entries, preserving order', () => {
    const result = addAddressedBy({
      frontmatter: frontmatter({ extra: { 'addressed-by': ['#789'] } }),
      body: 'b',
      references: ['[[fix]]', 'commit-abc'],
      now: NOW,
    });

    expect(result.frontmatter.extra['addressed-by']).toEqual(['#789', '[[fix]]', 'commit-abc']);
  });

  it('de-duplicates against existing entries in first-occurrence order', () => {
    const result = addAddressedBy({
      frontmatter: frontmatter({ extra: { 'addressed-by': ['#789', '[[fix]]'] } }),
      body: 'b',
      references: ['[[fix]]', '#999'],
      now: NOW,
    });

    expect(result.frontmatter.extra['addressed-by']).toEqual(['#789', '[[fix]]', '#999']);
  });

  it('de-duplicates references supplied in the same call', () => {
    const result = addAddressedBy({
      frontmatter: frontmatter(),
      body: 'b',
      references: ['[[fix]]', '[[fix]]'],
      now: NOW,
    });

    expect(result.frontmatter.extra['addressed-by']).toEqual(['[[fix]]']);
  });

  it('coerces a mis-authored scalar addressed-by to a one-element list before appending', () => {
    const result = addAddressedBy({
      frontmatter: frontmatter({ extra: { 'addressed-by': '#789' } }),
      body: 'b',
      references: ['[[fix]]'],
      now: NOW,
    });

    expect(result.frontmatter.extra['addressed-by']).toEqual(['#789', '[[fix]]']);
  });

  it('preserves other extra fields', () => {
    const result = addAddressedBy({
      frontmatter: frontmatter({ extra: { diataxis: 'howto' } }),
      body: 'b',
      references: ['[[fix]]'],
      now: NOW,
    });

    expect(result.frontmatter.extra.diataxis).toBe('howto');
  });

  it('does not mutate the input frontmatter', () => {
    const fm = frontmatter({ extra: { 'addressed-by': ['#789'] } });

    addAddressedBy({ frontmatter: fm, body: 'b', references: ['[[fix]]'], now: NOW });

    expect(fm.extra['addressed-by']).toEqual(['#789']);
    expect(fm.updated).toBe('2026-05-01');
  });
});

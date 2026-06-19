import type { Frontmatter } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { bumpUpdated } from '../bump-updated.ts';

const NOW = new Date('2026-05-24T14:35:00Z');

function frontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Example',
    recordType: 'assertion',
    created: '2026-05-01T08:17:23Z',
    updated: '2026-05-01T08:17:23Z',
    tags: ['example'],
    extra: {},
    ...overrides,
  };
}

describe(bumpUpdated, () => {
  it('sets updated to today (UTC) and leaves other fields untouched', () => {
    const result = bumpUpdated({ frontmatter: frontmatter(), body: 'unchanged body', now: NOW });

    expect(result.frontmatter.updated).toBe('2026-05-24T14:35:00Z');
    expect(result.frontmatter.title).toBe('Example');
    expect(result.frontmatter.created).toBe('2026-05-01T08:17:23Z');
    expect(result.frontmatter.tags).toEqual(['example']);
    expect(result.body).toBe('unchanged body');
  });

  it('preserves extra fields including last-verified', () => {
    const fm = frontmatter({ extra: { 'last-verified': '2026-05-10T16:05:47Z', 'applies-to': 'node 24' } });

    const result = bumpUpdated({ frontmatter: fm, body: 'b', now: NOW });

    expect(result.frontmatter.extra).toEqual({ 'last-verified': '2026-05-10T16:05:47Z', 'applies-to': 'node 24' });
  });

  it('does not mutate the input frontmatter', () => {
    const fm = frontmatter();
    const originalUpdated = fm.updated;

    bumpUpdated({ frontmatter: fm, body: 'b', now: NOW });

    expect(fm.updated).toBe(originalUpdated);
  });
});

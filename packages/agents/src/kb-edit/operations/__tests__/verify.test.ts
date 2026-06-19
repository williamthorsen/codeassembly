import type { Frontmatter } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { verify } from '../verify.ts';

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

describe(verify, () => {
  it('sets last-verified to today (UTC) and does not bump updated', () => {
    const result = verify({ frontmatter: frontmatter(), body: 'body', now: NOW });

    expect(result.frontmatter.extra['last-verified']).toBe('2026-05-24T14:35:00Z');
    expect(result.frontmatter.updated).toBe('2026-05-01T08:17:23Z');
  });

  it('adds last-verified when the field is absent', () => {
    const fm = frontmatter({ extra: {} });

    const result = verify({ frontmatter: fm, body: 'b', now: NOW });

    expect(result.frontmatter.extra).toEqual({ 'last-verified': '2026-05-24T14:35:00Z' });
  });

  it('overwrites an existing last-verified value', () => {
    const fm = frontmatter({ extra: { 'last-verified': '2026-01-15T11:42:09Z' } });

    const result = verify({ frontmatter: fm, body: 'b', now: NOW });

    expect(result.frontmatter.extra['last-verified']).toBe('2026-05-24T14:35:00Z');
  });

  it('preserves other extra fields when adding last-verified', () => {
    const fm = frontmatter({ extra: { 'applies-to': 'node 24', sources: ['docs.example.com'] } });

    const result = verify({ frontmatter: fm, body: 'b', now: NOW });

    expect(result.frontmatter.extra).toEqual({
      'applies-to': 'node 24',
      sources: ['docs.example.com'],
      'last-verified': '2026-05-24T14:35:00Z',
    });
  });

  it('advances a born-verified note last-verified to an instant at or after created', () => {
    const born = '2026-05-01T09:00:00Z';
    const fm = frontmatter({ created: born, updated: born, extra: { 'last-verified': born } });

    const result = verify({ frontmatter: fm, body: 'b', now: NOW });
    const lastVerified = result.frontmatter.extra['last-verified'];

    expect(lastVerified).toBe('2026-05-24T14:35:00Z');
    expect(Date.parse(String(lastVerified))).toBeGreaterThanOrEqual(Date.parse(result.frontmatter.created));
  });

  it('does not mutate the input frontmatter', () => {
    const fm = frontmatter();

    verify({ frontmatter: fm, body: 'b', now: NOW });

    expect(fm.extra).toEqual({});
  });
});

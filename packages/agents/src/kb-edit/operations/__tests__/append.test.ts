import type { Frontmatter } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { append } from '../append.ts';

const NOW = new Date('2026-05-24T14:35:00Z');

function frontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Example',
    recordType: 'assertion',
    created: '2026-05-01',
    updated: '2026-05-01',
    tags: ['example'],
    extra: {},
    ...overrides,
  };
}

describe(append, () => {
  it('appends the addition after a separating blank line and bumps updated', () => {
    const result = append({
      frontmatter: frontmatter(),
      body: 'First paragraph.',
      addition: 'Second paragraph.',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('First paragraph.\n\nSecond paragraph.\n');
      expect(result.frontmatter.updated).toBe('2026-05-24');
    }
  });

  it('trims trailing whitespace from the existing body before appending', () => {
    const result = append({
      frontmatter: frontmatter(),
      body: 'First paragraph.\n\n\n',
      addition: 'Second paragraph.',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('First paragraph.\n\nSecond paragraph.\n');
    }
  });

  it('trims trailing whitespace from the addition', () => {
    const result = append({
      frontmatter: frontmatter(),
      body: 'First.',
      addition: 'Second paragraph.\n\n',
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('First.\n\nSecond paragraph.\n');
    }
  });

  it('handles an empty existing body', () => {
    const result = append({ frontmatter: frontmatter(), body: '', addition: 'New content.', now: NOW });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toBe('\n\nNew content.\n');
    }
  });

  it('rejects empty stdin with empty-addition', () => {
    const result = append({ frontmatter: frontmatter(), body: 'body', addition: '', now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty-addition');
    }
  });

  it('rejects whitespace-only stdin with empty-addition', () => {
    const result = append({ frontmatter: frontmatter(), body: 'body', addition: '   \n\n  ', now: NOW });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty-addition');
    }
  });
});

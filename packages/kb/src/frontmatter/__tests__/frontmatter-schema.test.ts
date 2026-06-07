import { describe, expect, it } from 'vitest';

import { frontmatterSchema } from '../frontmatter-schema.ts';

const validFrontmatter = {
  title: 'A note',
  recordType: 'assertion',
  created: '2026-05-01',
  updated: '2026-05-14',
  tags: ['git', 'rebase'],
  extra: {},
};

describe('frontmatterSchema', () => {
  it('accepts a frontmatter object carrying all required fields', () => {
    expect(frontmatterSchema.safeParse(validFrontmatter).success).toBe(true);
  });

  it('rejects a frontmatter object with an empty title', () => {
    expect(frontmatterSchema.safeParse({ ...validFrontmatter, title: '' }).success).toBe(false);
  });

  it('rejects a frontmatter object whose tags are not a list of strings', () => {
    expect(frontmatterSchema.safeParse({ ...validFrontmatter, tags: 'git' }).success).toBe(false);
  });
});

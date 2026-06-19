import { describe, expect, it } from 'vitest';

import { frontmatterSchema } from '../frontmatter-schema.ts';

const validFrontmatter = {
  title: 'A note',
  recordType: 'assertion',
  created: '2026-05-01T10:17:29Z',
  updated: '2026-05-14T14:39:58Z',
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

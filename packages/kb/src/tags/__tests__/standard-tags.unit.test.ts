import { describe, expect, it } from 'vitest';

import { STANDARD_TAGS } from '../standard-tags.ts';

describe('STANDARD_TAGS', () => {
  const tags = STANDARD_TAGS.map((entry) => entry.tag);

  it('lists the tags in sorted order without duplicates', () => {
    expect(tags).toStrictEqual([...new Set(tags)].toSorted());
  });

  it('spells every tag in lowercase kebab-case', () => {
    for (const tag of tags) {
      expect(tag).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('gives every tag a non-empty meaning', () => {
    for (const entry of STANDARD_TAGS) {
      expect(entry.meaning.trim()).not.toBe('');
    }
  });
});

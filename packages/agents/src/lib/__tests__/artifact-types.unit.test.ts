import { describe, expect, it } from 'vitest';

import { ARTIFACT_TYPES } from '../artifact-types.ts';

describe('ARTIFACT_TYPES', () => {
  it('gives every type a non-empty plural key and content path', () => {
    for (const [type, meta] of Object.entries(ARTIFACT_TYPES)) {
      expect(meta.key, `${type} key`).toMatch(/\S/);
      expect(meta.contentPath, `${type} contentPath`).toMatch(/\S/);
    }
  });

  it('keeps plural keys distinct across types', () => {
    const keys = Object.values(ARTIFACT_TYPES).map((meta) => meta.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

import { describe, expect, it } from 'vitest';

import { defaultSchema } from '../default-schema.js';

describe('defaultSchema', () => {
  it('exposes the four Diátaxis types', () => {
    expect(defaultSchema.types).toEqual(['howto', 'concept', 'reference', 'tutorial']);
  });

  it('exposes the canonical required field set', () => {
    expect(defaultSchema.required).toEqual(['title', 'type', 'created', 'updated', 'tags']);
  });

  it('exposes the canonical optional field set', () => {
    expect(defaultSchema.optional).toEqual(['last-verified', 'applies-to', 'sources', 'supersedes', 'superseded-by']);
  });

  it('freezes the schema object so its top-level fields cannot be reassigned', () => {
    expect(Object.isFrozen(defaultSchema)).toBe(true);
  });

  it('freezes each schema array so callers cannot mutate the shared vocabulary', () => {
    expect(Object.isFrozen(defaultSchema.types)).toBe(true);
    expect(Object.isFrozen(defaultSchema.required)).toBe(true);
    expect(Object.isFrozen(defaultSchema.optional)).toBe(true);
  });

  it('rejects a runtime mutation of a frozen schema array', () => {
    // A frozen array silently drops index assignment outside strict mode and
    // throws inside it; either way the vocabulary stays intact.
    const mutate = (): void => {
      Object.defineProperty(defaultSchema.types, 0, { value: 'rogue' });
    };

    expect(mutate).toThrow();
    expect(defaultSchema.types[0]).toBe('howto');
  });
});

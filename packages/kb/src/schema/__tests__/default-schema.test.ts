import { describe, expect, it } from 'vitest';

import { defaultSchema } from '../default-schema.ts';

describe('defaultSchema', () => {
  it('declares the assertion and event record types', () => {
    expect(Object.keys(defaultSchema.recordTypes)).toEqual(['assertion', 'event']);
  });

  it('declares the canonical assertion required and optional field sets', () => {
    expect(defaultSchema.recordTypes.assertion?.required).toEqual(['title', 'created', 'updated', 'tags']);
    expect(defaultSchema.recordTypes.assertion?.optional).toEqual([
      'last-verified',
      'applies-to',
      'sources',
      'supersedes',
      'superseded-by',
    ]);
    expect(defaultSchema.recordTypes.assertion?.recall).toBe('freshness');
    expect(defaultSchema.recordTypes.assertion?.immutable).toBe(false);
  });

  it('declares the immutable event record type with its spine', () => {
    expect(defaultSchema.recordTypes.event?.required).toEqual(['id', 'captured-at', 'session', 'cwd', 'summary']);
    expect(defaultSchema.recordTypes.event?.optional).toEqual(['repo', 'skill', 'model', 'tags', 'correction']);
    expect(defaultSchema.recordTypes.event?.recall).toBe('recurrence-recency');
    expect(defaultSchema.recordTypes.event?.immutable).toBe(true);
  });

  it('carries no retired type or kind vocabulary', () => {
    expect('types' in defaultSchema).toBe(false);
    expect('kinds' in defaultSchema).toBe(false);
    for (const recordType of Object.values(defaultSchema.recordTypes)) {
      expect('types' in recordType).toBe(false);
      expect(recordType.required).not.toContain('type');
    }
  });

  it('freezes the schema object so its top-level fields cannot be reassigned', () => {
    expect(Object.isFrozen(defaultSchema)).toBe(true);
  });

  it('freezes the record-types map and each required array so callers cannot mutate the shared vocabulary', () => {
    expect(Object.isFrozen(defaultSchema.recordTypes)).toBe(true);
    expect(Object.isFrozen(defaultSchema.recordTypes.assertion?.required)).toBe(true);
    expect(Object.isFrozen(defaultSchema.recordTypes.event?.required)).toBe(true);
  });

  it('rejects a runtime mutation of a frozen required array', () => {
    // A frozen array silently drops index assignment outside strict mode and
    // throws inside it; either way the vocabulary stays intact.
    const required = defaultSchema.recordTypes.assertion?.required ?? [];
    const mutate = (): void => {
      Object.defineProperty(required, 0, { value: 'rogue' });
    };

    expect(mutate).toThrow();
    expect(required[0]).toBe('title');
  });
});

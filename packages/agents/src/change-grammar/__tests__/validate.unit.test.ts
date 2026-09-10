import { describe, expect, it } from 'vitest';

import type { Taxonomy } from '../types.ts';
import { validate } from '../validate.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'required', key: 'drop', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'fix', tier: 'public' },
    { key: 'refactor', tier: 'internal' },
  ],
};

describe(validate, () => {
  it('reports a fix carrying the marker its policy forbids', () => {
    expect(validate({ breaking: true, type: 'fix' }, TAXONOMY)).toStrictEqual({ policy: 'forbidden', type: 'fix' });
  });

  it('reports a drop omitting the marker its policy requires', () => {
    expect(validate({ type: 'drop' }, TAXONOMY)).toStrictEqual({ policy: 'required', type: 'drop' });
  });

  it('leaves the record untouched rather than normalizing the violation away', () => {
    const record = { breaking: true, title: 'Correct the guard', type: 'fix' };
    validate(record, TAXONOMY);

    expect(record).toStrictEqual({ breaking: true, title: 'Correct the guard', type: 'fix' });
  });

  it('accepts a drop carrying its required marker', () => {
    expect(validate({ breaking: true, type: 'drop' }, TAXONOMY)).toBeUndefined();
  });

  it('accepts a feat either way, its policy leaving the marker optional', () => {
    expect(validate({ type: 'feat' }, TAXONOMY)).toBeUndefined();
    expect(validate({ breaking: true, type: 'feat' }, TAXONOMY)).toBeUndefined();
  });

  it('treats a type declaring no policy as optional', () => {
    expect(validate({ breaking: true, type: 'refactor' }, TAXONOMY)).toBeUndefined();
  });

  it('reports nothing for a type the taxonomy does not declare', () => {
    expect(validate({ breaking: true, type: 'invented' }, TAXONOMY)).toBeUndefined();
  });
});

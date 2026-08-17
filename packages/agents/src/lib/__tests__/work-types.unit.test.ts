import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadWorkTypes, type WorkType } from '../work-types.ts';

const TAXONOMY = {
  types: [
    { key: 'feat', tier: 'public', aliases: ['feature'] },
    { key: 'fix', tier: 'public', aliases: ['bugfix'] },
    { key: 'ci', tier: 'process', aliases: [] },
  ],
};

describe(loadWorkTypes, () => {
  it('resolves a canonical key to its own entry', async () => {
    const index = await loadTaxonomy(TAXONOMY);

    expect(index.get('feat')).toStrictEqual({ key: 'feat', tier: 'public' });
  });

  it('resolves a declared alias to the canonical entry, so --type feature finds feat', async () => {
    const index = await loadTaxonomy(TAXONOMY);

    expect(index.get('feature')).toStrictEqual({ key: 'feat', tier: 'public' });
  });

  it('carries each type its declared tier', async () => {
    const index = await loadTaxonomy(TAXONOMY);

    expect(index.get('ci')?.tier).toBe('process');
  });

  it('yields nothing for a type the taxonomy does not declare', async () => {
    const index = await loadTaxonomy(TAXONOMY);

    expect(index.get('invented')).toBeUndefined();
  });

  it('lets a canonical key outrank an alias of another type that spells it', async () => {
    const index = await loadTaxonomy({
      types: [
        { key: 'internal', tier: 'internal', aliases: [] },
        { key: 'feat', tier: 'public', aliases: ['internal'] },
      ],
    });

    expect(index.get('internal')).toStrictEqual({ key: 'internal', tier: 'internal' });
  });

  it('skips an entry declaring no tier rather than dropping the whole taxonomy', async () => {
    const index = await loadTaxonomy({ types: [{ key: 'untiered' }, { key: 'feat', tier: 'public', aliases: [] }] });

    expect(index.get('untiered')).toBeUndefined();
    expect(index.get('feat')).toStrictEqual({ key: 'feat', tier: 'public' });
  });

  it('yields null when the directory holds no taxonomy', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'work-types-'));

    await expect(loadWorkTypes(dataDir)).resolves.toBeNull();
  });

  it('yields null for a taxonomy that is not valid JSON', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'work-types-'));
    await writeFile(join(dataDir, 'work-types.json'), '{ types: ', 'utf8');

    await expect(loadWorkTypes(dataDir)).resolves.toBeNull();
  });

  it('yields null for a taxonomy declaring no types list', async () => {
    const index = await loadWorkTypes(await writeTaxonomy({ tiers: ['public'] }));

    expect(index).toBeNull();
  });
});

// region | Helpers

/** Loads a taxonomy written to a fresh temporary directory, failing the test when it does not load. */
async function loadTaxonomy(taxonomy: unknown): Promise<ReadonlyMap<string, WorkType>> {
  const index = await loadWorkTypes(await writeTaxonomy(taxonomy));
  if (index === null) {
    throw new Error(`expected the taxonomy to load: ${JSON.stringify(taxonomy)}`);
  }
  return index;
}

/** Writes a taxonomy document to a fresh temporary directory and yields that directory. */
async function writeTaxonomy(taxonomy: unknown): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), 'work-types-'));
  await writeFile(join(dataDir, 'work-types.json'), JSON.stringify(taxonomy), 'utf8');
  return dataDir;
}

// endregion | Helpers

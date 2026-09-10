import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { Taxonomy } from '../../change-grammar/types.ts';
import { loadTaxonomy, loadWorkTypes, resolveWorkType, type WorkType } from '../work-types.ts';

const TAXONOMY = {
  types: [
    { key: 'feat', tier: 'public', aliases: ['feature'] },
    { key: 'fix', tier: 'public', aliases: ['bugfix'] },
    { key: 'ci', tier: 'process', aliases: [] },
  ],
};

describe(loadTaxonomy, () => {
  it('preserves the listing order, which is what ranks one type over another', async () => {
    const taxonomy = await readTaxonomy(TAXONOMY);

    expect(taxonomy.types.map((entry) => entry.key)).toStrictEqual(['feat', 'fix', 'ci']);
  });

  it('carries the declared tiers in order', async () => {
    const taxonomy = await readTaxonomy({ ...TAXONOMY, tiers: ['public', 'internal', 'process'] });

    expect(taxonomy.tiers).toStrictEqual(['public', 'internal', 'process']);
  });

  it('filters a tier entry that is not a string', async () => {
    const taxonomy = await readTaxonomy({ ...TAXONOMY, tiers: ['public', 7, 'process'] });

    expect(taxonomy.tiers).toStrictEqual(['public', 'process']);
  });

  it('yields no tiers where the taxonomy declares none', async () => {
    const taxonomy = await readTaxonomy(TAXONOMY);

    expect(taxonomy.tiers).toStrictEqual([]);
  });

  it('yields no tiers where the declared value is not a list', async () => {
    const taxonomy = await readTaxonomy({ ...TAXONOMY, tiers: 'public' });

    expect(taxonomy.tiers).toStrictEqual([]);
  });

  it('carries a declared breaking policy', async () => {
    const taxonomy = await readTaxonomy({ types: [{ key: 'drop', tier: 'public', breakingPolicy: 'required' }] });

    expect(taxonomy.types[0]?.breakingPolicy).toBe('required');
  });

  it('drops a breaking policy the taxonomy misspells, so nothing enforces an invented one', async () => {
    const taxonomy = await readTaxonomy({ types: [{ key: 'drop', tier: 'public', breakingPolicy: 'mandatory' }] });

    expect(taxonomy.types[0]).toStrictEqual({ aliases: [], key: 'drop', tier: 'public' });
  });

  it('carries each entry its declared aliases, and an empty list where it declares none', async () => {
    const taxonomy = await readTaxonomy(TAXONOMY);

    expect(taxonomy.types.map((entry) => entry.aliases)).toStrictEqual([['feature'], ['bugfix'], []]);
  });

  it('skips an entry declaring no tier rather than dropping the whole taxonomy', async () => {
    const taxonomy = await readTaxonomy({ types: [{ key: 'untiered' }, { key: 'feat', tier: 'public' }] });

    expect(taxonomy.types.map((entry) => entry.key)).toStrictEqual(['feat']);
  });

  it('yields null when the directory holds no taxonomy', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'work-types-'));

    await expect(loadTaxonomy(dataDir)).resolves.toBeNull();
  });

  it('yields null for a taxonomy declaring no types list', async () => {
    await expect(loadTaxonomy(await writeTaxonomy({ tiers: ['public'] }))).resolves.toBeNull();
  });
});

describe(loadWorkTypes, () => {
  it('resolves a canonical key to its own entry', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(index.get('feat')).toStrictEqual({ key: 'feat', tier: 'public' });
  });

  it('resolves a declared alias to the canonical entry, so --type feature finds feat', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(index.get('feature')).toStrictEqual({ key: 'feat', tier: 'public' });
  });

  it('carries each type its declared tier', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(index.get('ci')?.tier).toBe('process');
  });

  it('yields nothing for a type the taxonomy does not declare', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(index.get('invented')).toBeUndefined();
  });

  it('lets a canonical key outrank an alias of another type that spells it', async () => {
    const index = await loadWorkTypeIndex({
      types: [
        { key: 'internal', tier: 'internal', aliases: [] },
        { key: 'feat', tier: 'public', aliases: ['internal'] },
      ],
    });

    expect(index.get('internal')).toStrictEqual({ key: 'internal', tier: 'internal' });
  });

  it('skips an entry declaring no tier rather than dropping the whole taxonomy', async () => {
    const index = await loadWorkTypeIndex({
      types: [{ key: 'untiered' }, { key: 'feat', tier: 'public', aliases: [] }],
    });

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

describe(resolveWorkType, () => {
  it('resolves a canonical key, reporting no marker', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(resolveWorkType('feat', index)).toStrictEqual({
      workType: { key: 'feat', tier: 'public' },
      breaking: false,
    });
  });

  it('resolves a key carrying the breaking marker, so feat! names the declared feat', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(resolveWorkType('feat!', index)).toStrictEqual({
      workType: { key: 'feat', tier: 'public' },
      breaking: true,
    });
  });

  it('resolves an alias carrying the marker through the same index', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(resolveWorkType('feature!', index)).toStrictEqual({
      workType: { key: 'feat', tier: 'public' },
      breaking: true,
    });
  });

  it('yields null for a type the taxonomy does not declare', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(resolveWorkType('invented', index)).toBeNull();
  });

  it('yields null for an undeclared type carrying the marker, so the marker declares nothing', async () => {
    const index = await loadWorkTypeIndex(TAXONOMY);

    expect(resolveWorkType('invented!', index)).toBeNull();
  });
});

// region | Helpers

/** Loads a taxonomy written to a fresh temporary directory into its alias index, failing the test when it does not load. */
async function loadWorkTypeIndex(taxonomy: unknown): Promise<ReadonlyMap<string, WorkType>> {
  const index = await loadWorkTypes(await writeTaxonomy(taxonomy));
  if (index === null) {
    throw new Error(`expected the taxonomy to load: ${JSON.stringify(taxonomy)}`);
  }
  return index;
}

/** Reads a taxonomy written to a fresh temporary directory in the engine's ordered form, failing the test when it does not load. */
async function readTaxonomy(taxonomy: unknown): Promise<Taxonomy> {
  const ordered = await loadTaxonomy(await writeTaxonomy(taxonomy));
  if (ordered === null) {
    throw new Error(`expected the taxonomy to load: ${JSON.stringify(taxonomy)}`);
  }
  return ordered;
}

/** Writes a taxonomy document to a fresh temporary directory and yields that directory. */
async function writeTaxonomy(taxonomy: unknown): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), 'work-types-'));
  await writeFile(join(dataDir, 'work-types.json'), JSON.stringify(taxonomy), 'utf8');
  return dataDir;
}

// endregion | Helpers

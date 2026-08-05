import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { KbLoaderError } from '../../config/kb-loader-error.ts';
import { TAXONOMY_FILE } from '../../layout/index.ts';
import { makeKbRoot } from '../../test-utils/scaffolding.ts';
import type { KbRoot } from '../../types.ts';
import { loadTaxonomy } from '../load-taxonomy.ts';
import { writeTaxonomy } from '../write-taxonomy.ts';

const SEEDED = `# Taxonomy for this store.
domains:
  # the engineering spine
  engineering: Software engineering practice
  engineering/tooling: Build, test, and development tooling
`;

describe(writeTaxonomy, () => {
  it('creates the file and the requested block when none exists', async () => {
    const kbRoot = await makeKbRoot();

    const { added } = await writeTaxonomy({
      kbRoot,
      declarations: [{ path: 'engineering', description: 'Practice', provisional: false }],
    });

    expect(added).toEqual(['engineering']);
    expect(await readTaxonomy(kbRoot)).toBe('domains:\n  engineering: Practice\n');
  });

  it('preserves comments and existing key order when appending', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: SEEDED });

    await writeTaxonomy({
      kbRoot,
      declarations: [{ path: 'languages', description: 'Programming languages', provisional: false }],
    });

    expect(await readTaxonomy(kbRoot)).toBe(`${SEEDED}  languages: Programming languages\n`);
  });

  it('creates a missing block beside an existing one', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: SEEDED });

    await writeTaxonomy({ kbRoot, declarations: [{ path: 'tools/vim', provisional: true }] });

    expect(await readTaxonomy(kbRoot)).toBe(`${SEEDED}provisional:\n  tools/vim:\n`);
  });

  it('appends a batch in path order rather than call order', async () => {
    const kbRoot = await makeKbRoot();

    const { added } = await writeTaxonomy({
      kbRoot,
      declarations: [
        { path: 'tools', provisional: true },
        { path: 'engineering', provisional: true },
        { path: 'languages', provisional: true },
      ],
    });

    expect(added).toEqual(['engineering', 'languages', 'tools']);
    expect(await readTaxonomy(kbRoot)).toBe('provisional:\n  engineering:\n  languages:\n  tools:\n');
  });

  it('routes each declaration to the block its provisional flag names', async () => {
    const kbRoot = await makeKbRoot();

    await writeTaxonomy({
      kbRoot,
      declarations: [
        { path: 'engineering', description: 'Practice', provisional: false },
        { path: 'scratch', provisional: true },
      ],
    });

    expect(await readTaxonomy(kbRoot)).toBe('domains:\n  engineering: Practice\nprovisional:\n  scratch:\n');
  });

  it('writes a description-less domain as a bare key', async () => {
    const kbRoot = await makeKbRoot();

    await writeTaxonomy({ kbRoot, declarations: [{ path: 'engineering', description: '', provisional: true }] });

    expect(await readTaxonomy(kbRoot)).toBe('provisional:\n  engineering:\n');
  });

  it('leaves the file untouched when every path is already declared', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: SEEDED });

    const { added } = await writeTaxonomy({
      kbRoot,
      declarations: [{ path: 'engineering', description: 'A different description', provisional: false }],
    });

    expect(added).toEqual([]);
    expect(await readTaxonomy(kbRoot)).toBe(SEEDED);
  });

  it('skips a path the other block declares rather than duplicating it across blocks', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: SEEDED });

    const { added } = await writeTaxonomy({ kbRoot, declarations: [{ path: 'engineering', provisional: true }] });

    expect(added).toEqual([]);
    expect(await readTaxonomy(kbRoot)).toBe(SEEDED);
  });

  it('adds only the absent paths of a partially-declared batch', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: SEEDED });

    const { added } = await writeTaxonomy({
      kbRoot,
      declarations: [
        { path: 'engineering', provisional: false },
        { path: 'languages', provisional: false },
      ],
    });

    expect(added).toEqual(['languages']);
  });

  it('appends to a comment-only stub without disturbing its comments', async () => {
    const stub = '# Taxonomy for this store.\n#\n# Keys are relative to content/assertions/.\n';
    const kbRoot = await makeKbRoot({ taxonomy: stub });

    await writeTaxonomy({ kbRoot, declarations: [{ path: 'engineering', provisional: true }] });

    expect(await readTaxonomy(kbRoot)).toBe(`${stub}\nprovisional:\n  engineering:\n`);
  });

  it('writes what loadTaxonomy reads back', async () => {
    const kbRoot = await makeKbRoot();

    await writeTaxonomy({
      kbRoot,
      declarations: [
        { path: 'engineering', description: 'Practice', provisional: false },
        { path: 'engineering/tooling', provisional: true },
      ],
    });

    expect(await loadTaxonomy({ kbRoot })).toEqual(
      new Map([
        ['engineering', { description: 'Practice', provisional: false }],
        ['engineering/tooling', { description: '', provisional: true }],
      ]),
    );
  });

  it('throws on a malformed key without writing any of the batch', async () => {
    const kbRoot = await makeKbRoot();

    await expect(
      writeTaxonomy({
        kbRoot,
        declarations: [
          { path: 'engineering', provisional: false },
          { path: 'content/assertions/tools', provisional: false },
        ],
      }),
    ).rejects.toBeInstanceOf(KbLoaderError);
    await expect(readTaxonomy(kbRoot)).rejects.toThrow(/ENOENT/);
  });

  it('refuses a file whose YAML cannot be parsed', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: 'domains: [unterminated\n' });

    await expect(
      writeTaxonomy({ kbRoot, declarations: [{ path: 'engineering', provisional: false }] }),
    ).rejects.toBeInstanceOf(KbLoaderError);
  });

  it('refuses a file whose top level is not a mapping', async () => {
    const kbRoot = await makeKbRoot({ taxonomy: '- engineering\n' });

    await expect(
      writeTaxonomy({ kbRoot, declarations: [{ path: 'engineering', provisional: false }] }),
    ).rejects.toThrow(/mapping/);
  });
});

// region | Helpers

/** Reads the store's taxonomy file as raw text, so a test can assert on formatting rather than parsed content. */
function readTaxonomy(kbRoot: KbRoot): Promise<string> {
  return readFile(join(kbRoot.path, TAXONOMY_FILE), 'utf8');
}

// endregion | Helpers

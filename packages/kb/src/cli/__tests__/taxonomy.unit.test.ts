import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { check } from '../../check/check.ts';
import { TAXONOMY_FILE } from '../../layout/index.ts';
import { getRegistryPathFor, makeStore, makeTempDir, seedRegistry } from '../../test-utils/scaffolding.ts';
import { run } from '../run.ts';

const VALID =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

const POPULATED = {
  'content/assertions/engineering/tooling/versioning/Releases.md': VALID,
  'content/assertions/languages/Rust.md': VALID,
  'content/events/01JABC.md': VALID,
};

describe('kb taxonomy init', () => {
  it('declares every folder holding notes and each of its ancestors', async () => {
    const store = await makeStore(POPULATED);

    const result = await run({ argv: ['taxonomy', 'init'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(await readTaxonomy(store)).toBe(
      'provisional:\n  engineering:\n  engineering/tooling:\n  engineering/tooling/versioning:\n  languages:\n',
    );
  });

  it('leaves the back-filled store with no taxonomy findings', async () => {
    const store = await makeStore(POPULATED);

    await run({ argv: ['taxonomy', 'init'], cwd: store });
    const { findings } = await check({ kbRoot: store });

    expect(findings.filter((finding) => finding.rule.startsWith('taxonomy.'))).toEqual([]);
  });

  it('reports the domain count it declared', async () => {
    const store = await makeStore(POPULATED);

    const result = await run({ argv: ['taxonomy', 'init'], cwd: store });

    expect(result.stdout).toBe(`declared 4 domains in ${TAXONOMY_FILE}\n`);
  });

  it('refuses a store that already declares a taxonomy', async () => {
    const store = await makeStore({ ...POPULATED, [TAXONOMY_FILE]: 'domains:\n  languages: Languages\n' });

    const result = await run({ argv: ['taxonomy', 'init'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--merge');
    expect(await readTaxonomy(store)).toBe('domains:\n  languages: Languages\n');
  });

  it('adds only the absent domains under --merge', async () => {
    const store = await makeStore({ ...POPULATED, [TAXONOMY_FILE]: 'domains:\n  languages: Languages\n' });

    const result = await run({ argv: ['taxonomy', 'init', '--merge'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(await readTaxonomy(store)).toBe(
      'domains:\n  languages: Languages\nprovisional:\n  engineering:\n  engineering/tooling:\n  engineering/tooling/versioning:\n',
    );
  });

  it('is a no-op on a second --merge run', async () => {
    const store = await makeStore(POPULATED);

    await run({ argv: ['taxonomy', 'init'], cwd: store });
    const first = await readTaxonomy(store);
    const result = await run({ argv: ['taxonomy', 'init', '--merge'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('already declares every derived domain');
    expect(await readTaxonomy(store)).toBe(first);
  });

  it('merges into a taxonomy whose block header has nothing under it', async () => {
    const store = await makeStore({
      ...POPULATED,
      [TAXONOMY_FILE]: 'domains:\n  languages: Languages\nprovisional:\n',
    });

    const result = await run({ argv: ['taxonomy', 'init', '--merge'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(await readTaxonomy(store)).toBe(
      'domains:\n  languages: Languages\nprovisional:\n  engineering:\n  engineering/tooling:\n  engineering/tooling/versioning:\n',
    );
  });

  it('refuses a store the registry marks readonly', async () => {
    const store = await makeStore(POPULATED);
    const home = await makeTempDir('kb-taxonomy-home-');
    await seedRegistry(getRegistryPathFor(home), `kbs:\n  mirror:\n    path: ${store}\n    readonly: true\n`);

    const result = await run({ argv: ['taxonomy', 'init', '--kb', 'mirror'], cwd: store, home });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('readonly');
    await expect(readTaxonomy(store)).rejects.toThrow(/ENOENT/);
  });

  it('writes nothing for a store whose assertion folders hold no notes', async () => {
    const store = await makeStore({ 'content/assertions/Loose.md': VALID });

    const result = await run({ argv: ['taxonomy', 'init'], cwd: store });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no assertion folders hold notes');
    await expect(readTaxonomy(store)).rejects.toThrow(/ENOENT/);
  });

  it('exits 2 when the existing taxonomy is malformed', async () => {
    const store = await makeStore({ ...POPULATED, [TAXONOMY_FILE]: 'domains: [unterminated\n' });

    const result = await run({ argv: ['taxonomy', 'init'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('taxonomy.yaml');
  });

  it('exits 2 when no .kb/ directory is found', async () => {
    const empty = await makeTempDir('kb-taxonomy-empty-');

    const result = await run({ argv: ['taxonomy', 'init'], cwd: empty });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('no .kb/');
  });

  it('exits 2 for an unknown subcommand', async () => {
    const store = await makeStore(POPULATED);

    const result = await run({ argv: ['taxonomy', 'backfill'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown subcommand');
  });

  it('exits 2 when no subcommand is given', async () => {
    const store = await makeStore(POPULATED);

    const result = await run({ argv: ['taxonomy'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('no subcommand');
  });

  it('exits 2 for an unknown flag', async () => {
    const store = await makeStore(POPULATED);

    const result = await run({ argv: ['taxonomy', 'init', '--force'], cwd: store });

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('unknown flag');
  });

  it('prints help for taxonomy --help', async () => {
    const result = await run({ argv: ['taxonomy', '--help'], cwd: process.cwd() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: kb taxonomy init');
  });

  it('lists taxonomy in the top-level help', async () => {
    const result = await run({ argv: [], cwd: process.cwd() });

    expect(result.stdout).toContain('taxonomy');
  });
});

// region | Helpers

/** Reads the store's taxonomy file as raw text, so a test can assert on formatting rather than parsed content. */
function readTaxonomy(storePath: string): Promise<string> {
  return readFile(join(storePath, TAXONOMY_FILE), 'utf8');
}

// endregion | Helpers

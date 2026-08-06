import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { declareDomain } from '../declare-domain.ts';

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(declareDomain, () => {
  it('declares the note folder and every undeclared ancestor, leaving ancestors bare and provisional', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains:\n  engineering: Practice\n' });
    const notePath = await writeNoteAt(kbPath, 'languages/typescript/Types.md');

    const placement = await declareDomain({
      kbPath,
      notePath,
      description: 'The TypeScript language',
      auto: false,
    });

    expect(placement).toEqual({ domain: 'languages/typescript', added: ['languages', 'languages/typescript'] });
    expect(await readTaxonomy(kbPath)).toBe(
      'domains:\n  engineering: Practice\n  languages/typescript: The TypeScript language\nprovisional:\n  languages:\n',
    );
  });

  it('leaves the taxonomy byte-identical when a domain already declares the note folder', async () => {
    const original = '# Curated by hand\ndomains:\n  languages: Programming languages\n';
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': original });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    const placement = await declareDomain({ kbPath, notePath, description: 'Ignored', auto: false });

    expect(placement).toEqual({ domain: 'languages', added: [] });
    expect(await readTaxonomy(kbPath)).toBe(original);
  });

  it('declares a domain bare when no description was supplied', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains:\n' });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    await declareDomain({ kbPath, notePath, description: null, auto: false });

    expect(await readTaxonomy(kbPath)).toContain('provisional:\n  languages:\n');
  });

  it('routes a described domain to provisional under --auto', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains:\n' });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    await declareDomain({ kbPath, notePath, description: 'Programming languages', auto: true });

    expect(await readTaxonomy(kbPath)).toContain('provisional:\n  languages: Programming languages\n');
  });

  it('leaves a store with no taxonomy file untouched and reports no placement', async () => {
    const kbPath = await makeStore({});
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    const placement = await declareDomain({ kbPath, notePath, description: 'Languages', auto: false });

    expect(placement).toBeUndefined();
    await expect(readTaxonomy(kbPath)).rejects.toThrow();
  });

  it('grows the first domain of a store whose taxonomy file declares nothing', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': '' });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    const placement = await declareDomain({ kbPath, notePath, description: 'Programming languages', auto: false });

    expect(placement).toEqual({ domain: 'languages', added: ['languages'] });
    expect(await readTaxonomy(kbPath)).toBe('domains:\n  languages: Programming languages\n');
  });

  it('reports a note at the assertions root as sitting under no domain', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains:\n  languages: Programming languages\n' });
    const notePath = await writeNoteAt(kbPath, 'Loose.md');

    const placement = await declareDomain({ kbPath, notePath, description: null, auto: false });

    expect(placement).toEqual({ domain: null, added: [] });
    expect(await readTaxonomy(kbPath)).toBe('domains:\n  languages: Programming languages\n');
  });

  it('returns a warning naming the undeclared domain when the taxonomy cannot be appended to', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains: not-a-mapping\n' });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');

    const placement = await declareDomain({ kbPath, notePath, description: 'Languages', auto: false });

    expect(placement?.domain).toBe('languages');
    expect(placement?.added).toEqual([]);
    expect(placement?.warning).toContain('could not declare domain "languages"');
  });

  it('reports a warning rather than throwing when the taxonomy cannot be read', async () => {
    const kbPath = await makeStore({ '.kb/taxonomy.yaml': 'domains:\n' });
    const notePath = await writeNoteAt(kbPath, 'languages/Types.md');
    await chmod(join(kbPath, '.kb', 'taxonomy.yaml'), 0o000);

    const placement = await declareDomain({ kbPath, notePath, description: null, auto: false });

    await chmod(join(kbPath, '.kb', 'taxonomy.yaml'), 0o644);
    expect(placement?.warning).toContain('could not declare domain "languages"');
  });
});

// region | Helpers

/** Stands up a temp store with an initialized `.kb/` and the given store-root-relative files; returns its path. */
async function makeStore(files: Record<string, string>): Promise<string> {
  const kbPath = await mkdtemp(join(tmpdir(), 'kb-add-declare-'));
  await mkdir(join(kbPath, '.kb'), { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFile(join(kbPath, relativePath), content, 'utf8');
  }
  return kbPath;
}

/** Reads the store's `.kb/taxonomy.yaml`; rejects when the file is absent. */
async function readTaxonomy(kbPath: string): Promise<string> {
  return readFile(join(kbPath, '.kb', 'taxonomy.yaml'), 'utf8');
}

/** Writes a note at an assertions-root-relative path and returns its absolute path. */
async function writeNoteAt(kbPath: string, relativePath: string): Promise<string> {
  const notePath = join(kbPath, 'content', 'assertions', relativePath);
  await mkdir(join(notePath, '..'), { recursive: true });
  await writeFile(notePath, NOTE, 'utf8');
  return notePath;
}

// endregion | Helpers

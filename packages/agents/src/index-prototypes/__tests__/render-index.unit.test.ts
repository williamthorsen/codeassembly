import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { runIndexPrototypes } from '../cli.ts';
import { INDEX_PAGE_SCRIPT, SHORTCUT_KEYS, VERDICTS_COLLECTION } from '../index-page-script.ts';
import { PAGE_LIMIT_BYTES, PAGE_WARN_BYTES, renderIndexPage } from '../render-index.ts';
import { buildPng } from '../test-utils/build-png.ts';
import { THEME_TOKENS } from '../tokens.ts';
import type { Manifest, ManifestEntry } from '../types.ts';

const NOW = new Date('2026-10-03T01:19:36.000Z');

describe(renderIndexPage, () => {
  it('opens with the title and the stylesheet, without a document wrapper', () => {
    const page = renderIndexPage({ title: 'Header variants', cards: [] });

    expect(page.startsWith('<title>Header variants</title>\n<style>')).toBe(true);
    expect(page).not.toMatch(/<!doctype|<(?:body|head|html)[\s>]/i);
  });

  it('declares both themes in the three-state shape', () => {
    const page = renderIndexPage({ title: 'T', cards: [] });

    expect(page).toContain(`:root { color-scheme: light; --accent: ${THEME_TOKENS.light.accent};`);
    expect(page).toContain(
      `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) { color-scheme: dark; --accent: ${THEME_TOKENS.dark.accent};`,
    );
    expect(page).toContain(`:root[data-theme="dark"] { color-scheme: dark; --accent: ${THEME_TOKENS.dark.accent};`);
    expect(page).toContain('body { margin: 0; background: var(--page);');
  });

  it('renders one card per input with its metadata, chips, and a thumbnail data URI', () => {
    const page = renderIndexPage({
      title: 'T',
      cards: [
        {
          entry: buildEntry({ slug: 'dense', lens: 'density', inputs: ['ticket', 'sketch'] }),
          shot: Buffer.from('png'),
        },
        { entry: buildEntry({ slug: 'airy' }), shot: null },
      ],
    });

    expect(page.match(/<article class="card"/g)).toHaveLength(2);
    expect(page).toContain('<p class="meta">dense · v1 · 2026-10-03 01:19 UTC</p>');
    expect(page).toContain(
      '<li class="chip">Lens: density</li><li class="chip">ticket</li><li class="chip">sketch</li>',
    );
    expect(page).toContain(
      `<img src="data:image/png;base64,${Buffer.from('png').toString('base64')}" alt="Screenshot of Prototype dense">`,
    );
    expect(page).toContain('<span class="placeholder">No screenshot for v1</span>');
    expect(page).toContain('href="https://claude.ai/artifact/dense" target="_blank" rel="noopener"');
  });

  it('offers a rank for every position in the set', () => {
    const page = renderIndexPage({
      title: 'T',
      cards: ['a', 'b', 'c'].map((slug) => ({ entry: buildEntry({ slug }), shot: null })),
    });

    expect(page).toContain(
      '<option value="">None</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>',
    );
  });

  it('escapes manifest text', () => {
    const page = renderIndexPage({
      title: '<Set> & "co"',
      cards: [{ entry: buildEntry({ slug: 'a', title: '<img onerror=x>', description: "it's <b>" }), shot: null }],
    });

    expect(page).toContain('<title>&lt;Set&gt; &amp; &quot;co&quot;</title>');
    expect(page).not.toContain('<img onerror=x>');
    expect(page).toContain('<p class="description">it&#39;s &lt;b&gt;</p>');
  });

  it('lists every shortcut key in the hint', () => {
    const page = renderIndexPage({ title: 'T', cards: [] });
    const hint = /<p class="hint"[^>]*>(.*?)<\/p>/.exec(page)?.[1] ?? '';

    for (const key of SHORTCUT_KEYS) {
      expect(hint).toContain(`<kbd>${key}</kbd>`);
    }
  });

  it('embeds a script that reads the verdicts collection and cannot close its own element', () => {
    const page = renderIndexPage({ title: 'T', cards: [] });

    expect(page).toContain(`<script>${INDEX_PAGE_SCRIPT}</script>`);
    expect(INDEX_PAGE_SCRIPT).toContain(`const COLLECTION = '${VERDICTS_COLLECTION}';`);
    expect(INDEX_PAGE_SCRIPT).not.toMatch(/<\/script/i);
    expect(() => new Script(INDEX_PAGE_SCRIPT)).not.toThrow();
  });
});

describe('render command', () => {
  it('renders only the latest version of each slug and reports the page', async () => {
    const setDir = await makeSetDir();
    await mkdir(path.join(setDir, 'shots'), { recursive: true });
    await writeFile(path.join(setDir, 'shots', 'a-v2.png'), buildPng(4, 2));
    await writeManifestFile(setDir, {
      title: 'Set',
      indexUrl: 'https://claude.ai/artifact/index',
      entries: [
        buildEntry({ slug: 'a', title: 'First draft' }),
        buildEntry({ slug: 'b' }),
        buildEntry({ slug: 'a', version: 2, title: 'Second draft', shot: 'shots/a-v2.png' }),
      ],
    });
    const out = path.join(setDir, 'out', 'index.html');

    const result = await render(setDir, out);

    const page = await readFile(out, 'utf8');
    expect(result).toEqual({
      ok: true,
      command: 'render',
      path: out,
      bytes: Buffer.byteLength(page, 'utf8'),
      cards: 2,
      title: 'Set',
      indexUrl: 'https://claude.ai/artifact/index',
      missingShots: [],
    });
    expect(page).toContain('Second draft');
    expect(page).not.toContain('First draft');
    expect(page).toContain('data:image/png;base64,');
  });

  it('renders the placeholder for a recorded screenshot missing from disk and reports it', async () => {
    const setDir = await makeSetDir();
    await writeManifestFile(setDir, {
      title: 'Set',
      indexUrl: null,
      entries: [buildEntry({ slug: 'a', shot: 'shots/a-v1.png' })],
    });

    const result = await render(setDir, path.join(setDir, 'index.html'));

    expect(result).toMatchObject({ ok: true, missingShots: ['a'] });
    expect(await readFile(path.join(setDir, 'index.html'), 'utf8')).toContain('No screenshot for v1');
  });

  it('warns about a page over the warning threshold', async () => {
    const setDir = await makeSetDirWithShotOfSize(Math.ceil((PAGE_WARN_BYTES * 3) / 4) + 1_000);

    const result = await render(setDir, path.join(setDir, 'index.html'));

    expect(result).toMatchObject({
      ok: true,
      warning: expect.stringMatching(/approaching the 16000000-byte artifact cap/),
    });
  });

  it('refuses a page over the artifact cap without writing it', async () => {
    const setDir = await makeSetDirWithShotOfSize(Math.ceil((PAGE_LIMIT_BYTES * 3) / 4) + 1_000);

    const result = await render(setDir, path.join(setDir, 'index.html'));

    expect(result).toMatchObject({ ok: false, error: 'page-too-large' });
    await expect(readFile(path.join(setDir, 'index.html'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('refuses a set without a manifest', async () => {
    const setDir = await makeSetDir();

    await expect(render(setDir, path.join(setDir, 'index.html'))).resolves.toMatchObject({
      ok: false,
      error: 'manifest-not-found',
    });
  });
});

// region | Helpers

/** Builds a manifest entry, overriding the fixed defaults with `fields`. */
function buildEntry(fields: Partial<ManifestEntry> & { slug: string }): ManifestEntry {
  return {
    version: 1,
    registeredAt: NOW.toISOString(),
    title: `Prototype ${fields.slug}`,
    url: `https://claude.ai/artifact/${fields.slug}`,
    source: null,
    lens: null,
    inputs: [],
    description: null,
    shot: null,
    downsized: false,
    ...fields,
  };
}

/** Creates an empty set directory. */
async function makeSetDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'index-prototypes-render-'));
}

/** Creates a set with one prototype whose stored screenshot is `size` bytes. */
async function makeSetDirWithShotOfSize(size: number): Promise<string> {
  const setDir = await makeSetDir();
  await mkdir(path.join(setDir, 'shots'), { recursive: true });
  await writeFile(path.join(setDir, 'shots', 'a-v1.png'), Buffer.alloc(size));
  await writeManifestFile(setDir, {
    title: 'Set',
    indexUrl: null,
    entries: [buildEntry({ slug: 'a', shot: 'shots/a-v1.png' })],
  });
  return setDir;
}

/** Runs the render command. */
async function render(setDir: string, out: string) {
  return runIndexPrototypes({ argv: ['render', '--set-dir', setDir, '--out', out], now: NOW });
}

/** Writes `manifest` as the set's manifest file. */
async function writeManifestFile(setDir: string, manifest: Manifest): Promise<void> {
  await writeFile(path.join(setDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
}

// endregion | Helpers

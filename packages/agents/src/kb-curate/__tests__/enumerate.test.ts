import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { enumerateNotes } from '../enumerate.ts';

/** Directories whose `readdir` should reject; cleared between tests. */
const unreadableDirs = new Set<string>();

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: (path: Parameters<typeof actual.readdir>[0], options: Parameters<typeof actual.readdir>[1]) => {
      if (typeof path === 'string' && unreadableDirs.has(path)) {
        return Promise.reject(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));
      }
      return actual.readdir(path, options);
    },
  };
});

afterEach(() => {
  unreadableDirs.clear();
  vi.restoreAllMocks();
});

async function makeVault(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-curate-enumerate-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return root;
}

const VALID = '---\ntitle: A\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

describe(enumerateNotes, () => {
  it('finds notes in nested and dated directories', async () => {
    const root = await makeVault({
      'top.md': VALID,
      'folder/nested.md': VALID,
      '2026-05-29/dated.md': VALID,
    });

    const notes = await enumerateNotes(root);

    expect(notes.map((entry) => entry.relativePath).toSorted()).toEqual([
      '2026-05-29/dated.md',
      'folder/nested.md',
      'top.md',
    ]);
  });

  it('keeps a note with malformed frontmatter rather than dropping it', async () => {
    const root = await makeVault({ 'broken.md': '---\ntitle: [unterminated\n---\n\nBody.\n' });

    const notes = await enumerateNotes(root);

    expect(notes).toHaveLength(1);
    expect(notes[0]?.note.frontmatter).toBeNull();
    expect(notes[0]?.relativePath).toBe('broken.md');
  });

  it('skips dot-directories and node_modules', async () => {
    const root = await makeVault({
      'kept.md': VALID,
      '.kb/schema-note.md': VALID,
      '.git/hook.md': VALID,
      'node_modules/dep/readme.md': VALID,
    });

    const notes = await enumerateNotes(root);

    expect(notes.map((entry) => entry.relativePath)).toEqual(['kept.md']);
  });

  it('ignores non-markdown files', async () => {
    const root = await makeVault({ 'note.md': VALID, 'data.json': '{}', 'image.png': 'x' });

    const notes = await enumerateNotes(root);

    expect(notes.map((entry) => entry.relativePath)).toEqual(['note.md']);
  });

  it('skips an unreadable subdirectory and still returns the readable notes', async () => {
    const root = await makeVault({ 'top.md': VALID, 'restricted/inside.md': VALID });
    const blockedDir = join(root, 'restricted');
    unreadableDirs.add(blockedDir);
    const warnings: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      warnings.push(String(chunk));
      return true;
    });

    const notes = await enumerateNotes(root);

    expect(notes.map((entry) => entry.relativePath)).toEqual(['top.md']);
    expect(warnings.join('')).toContain(`could not read directory ${blockedDir}`);
  });
});

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Frontmatter, Schema } from '@codeassembly/kb-core';
import { defaultSchema } from '@codeassembly/kb-core';
import { describe, expect, it } from 'vitest';

import { writeBackNote } from '../write-back.ts';

async function makeTempPath(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  return join(dir, 'note.md');
}

const SCHEMA: Schema = defaultSchema;

function validFrontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'Example',
    type: 'howto',
    created: '2026-05-01',
    updated: '2026-05-01',
    tags: ['example'],
    extra: {},
    ...overrides,
  };
}

describe(writeBackNote, () => {
  it('renders frontmatter and body to disk on a valid write', async () => {
    const path = await makeTempPath('kb-edit-wb-ok-');
    await writeFile(path, '---\ntitle: Old\n---\n\nOld body\n', 'utf8');

    const result = await writeBackNote({
      path,
      frontmatter: validFrontmatter({ title: 'New' }),
      body: 'New body\n',
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
    const written = await readFile(path, 'utf8');
    expect(written).toContain('title: New');
    expect(written).toContain('New body');
  });

  it('returns the written content on success', async () => {
    const path = await makeTempPath('kb-edit-wb-content-');
    await writeFile(path, '---\ntitle: x\n---\n\nbody\n', 'utf8');

    const result = await writeBackNote({
      path,
      frontmatter: validFrontmatter(),
      body: 'body\n',
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const written = await readFile(path, 'utf8');
      expect(result.content).toBe(written);
    }
  });

  it('refuses to write and leaves the original file untouched when validation fails', async () => {
    const path = await makeTempPath('kb-edit-wb-bad-type-');
    const before = '---\ntitle: original\n---\n\nuntouched\n';
    await writeFile(path, before, 'utf8');

    const result = await writeBackNote({
      path,
      // `rant` is not in the default schema's types vocabulary.
      frontmatter: validFrontmatter({ type: 'rant' }),
      body: 'should not land\n',
      schema: SCHEMA,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('schema-validation');
      expect(result.findings.some((f) => f.rule === 'frontmatter.type')).toBe(true);
    }
    const after = await readFile(path, 'utf8');
    expect(after).toBe(before);
  });

  it('round-trips a structurally identical note when frontmatter is unchanged', async () => {
    const path = await makeTempPath('kb-edit-wb-roundtrip-');
    const original = '---\ntitle: x\ntype: howto\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [a]\n---\n\nbody\n';
    await writeFile(path, original, 'utf8');

    const result = await writeBackNote({
      path,
      frontmatter: {
        title: 'x',
        type: 'howto',
        created: '2026-05-01',
        updated: '2026-05-01',
        tags: ['a'],
        extra: {},
      },
      body: 'body\n',
      schema: SCHEMA,
    });

    expect(result.ok).toBe(true);
    const written = await readFile(path, 'utf8');
    expect(written).toBe(original);
  });
});

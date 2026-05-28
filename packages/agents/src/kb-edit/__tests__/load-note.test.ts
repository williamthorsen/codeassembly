import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadNote } from '../load-note.ts';

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

const VALID_NOTE = `---
title: Example
type: howto
created: 2026-05-01
updated: 2026-05-01
tags: [example]
---

Body text.
`;

describe(loadNote, () => {
  it('returns the parsed note when the file exists and frontmatter is valid', async () => {
    const dir = await makeTempDir('kb-edit-load-ok-');
    const path = join(dir, 'note.md');
    await writeFile(path, VALID_NOTE, 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.note.frontmatter?.title).toBe('Example');
      expect(result.note.frontmatter?.tags).toEqual(['example']);
      expect(result.note.body.trim()).toBe('Body text.');
    }
  });

  it('returns note-not-found when the path does not exist', async () => {
    const dir = await makeTempDir('kb-edit-load-missing-');
    const path = join(dir, 'absent.md');

    const result = await loadNote({ path });

    expect(result).toEqual({ ok: false, reason: 'note-not-found', path });
  });

  it('returns note-parse when the frontmatter block is malformed YAML', async () => {
    const dir = await makeTempDir('kb-edit-load-bad-yaml-');
    const path = join(dir, 'note.md');
    // A frontmatter block with an unterminated flow mapping forces yaml to record a parse error.
    await writeFile(path, '---\ntitle: {broken\n---\n\nBody\n', 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('note-parse');
      expect(result.path).toBe(path);
      if (result.reason === 'note-parse') {
        expect(result.parseError).toMatch(/./);
      }
    }
  });

  it('returns note-parse when no frontmatter block is present', async () => {
    const dir = await makeTempDir('kb-edit-load-no-fm-');
    const path = join(dir, 'note.md');
    await writeFile(path, 'Just body, no frontmatter.\n', 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'note-parse') {
      expect(result.parseError).toBe('no frontmatter block found');
    }
  });

  it('returns note-parse when the frontmatter block is not a YAML map', async () => {
    const dir = await makeTempDir('kb-edit-load-not-map-');
    const path = join(dir, 'note.md');
    // Frontmatter parses successfully but yields a sequence instead of a map.
    await writeFile(path, '---\n- one\n- two\n---\n\nBody\n', 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'note-parse') {
      expect(result.parseError).toBe('frontmatter is not a YAML map');
    }
  });
});

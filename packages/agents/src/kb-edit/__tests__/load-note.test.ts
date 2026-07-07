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
recordType: assertion
created: 2026-05-01
updated: 2026-05-01
tags: [example]
type: howto
---

Body text.
`;

describe(loadNote, () => {
  it('returns the parsed record when the file exists and frontmatter is a valid assertion', async () => {
    const dir = await makeTempDir('kb-edit-load-ok-');
    const path = join(dir, 'note.md');
    await writeFile(path, VALID_NOTE, 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.title).toBe('Example');
      expect(result.record.tags).toEqual(['example']);
      expect(result.record.body.trim()).toBe('Body text.');
      expect(result.content).toBe(VALID_NOTE);
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

  it('returns note-parse when the frontmatter does not satisfy the assertion contract', async () => {
    const dir = await makeTempDir('kb-edit-load-off-contract-');
    const path = join(dir, 'note.md');
    // Frontmatter parses as a sequence, not an assertion map, so the record fails to project.
    await writeFile(path, '---\n- one\n- two\n---\n\nBody\n', 'utf8');

    const result = await loadNote({ path });

    expect(result.ok).toBe(false);
    if (!result.ok && result.reason === 'note-parse') {
      expect(result.parseError).toContain('recordType');
    }
  });
});

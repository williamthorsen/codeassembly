import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readNoteContent } from '../read-note.ts';
import { renderNote, writeNote } from '../write-note.ts';

describe(renderNote, () => {
  it('assembles fences, frontmatter, a blank line, and the body', () => {
    const note = renderNote({ recordType: 'event', summary: 'a glitch' }, 'The body.\n');
    expect(note).toBe('---\nrecordType: event\nsummary: a glitch\n---\n\nThe body.\n');
  });

  it('round-trips fields and body through readNoteContent', () => {
    const fields = { title: 'A note', tags: ['git', 'rebase'] };
    const read = readNoteContent(renderNote(fields, '\nThe body.\n'));
    expect(read.error).toBeUndefined();
    expect(read.fields).toEqual(fields);
    expect(read.body).toBe('\nThe body.\n');
  });
});

describe(writeNote, () => {
  it('writes a note that reads back to the same fields and body', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kb-note-io-'));
    const path = join(dir, 'note.md');
    const fields = { recordType: 'assertion', title: 'Atomic', tags: ['a'] };
    try {
      await writeNote(path, fields, '\nBody text.\n');
      const read = readNoteContent(await readFile(path, 'utf8'));
      expect(read.fields).toEqual(fields);
      expect(read.body).toBe('\nBody text.\n');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

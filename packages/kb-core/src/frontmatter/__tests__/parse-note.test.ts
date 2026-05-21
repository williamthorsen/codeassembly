import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNote, parseNoteContent } from '../parse-note.js';

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures');

async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), 'utf8');
}

describe(parseNoteContent, () => {
  it('when frontmatter is well-formed, returns typed required fields', async () => {
    const note = parseNoteContent({ content: await readFixture('howto-typical.md') });

    expect(note.frontmatter).toEqual({
      title: 'How to rebase onto main',
      type: 'howto',
      created: '2026-05-01',
      updated: '2026-05-14',
      tags: ['git', 'rebase'],
      extra: {},
    });
  });

  it('when a note has no opening fence, returns null frontmatter and the whole content as body', async () => {
    const content = await readFixture('no-frontmatter.md');
    const note = parseNoteContent({ content });

    expect(note.frontmatter).toBeNull();
    expect(note.frontmatterRaw).toBeNull();
    expect(note.body).toBe(content);
    expect(note.bodyStartLine).toBe(1);
  });

  it('when the frontmatter block is empty, returns null frontmatter but a non-null raw slice', async () => {
    const note = parseNoteContent({ content: await readFixture('empty-block.md') });

    expect(note.frontmatter).toBeNull();
    expect(note.frontmatterRaw).not.toBeNull();
    expect(note.frontmatterRaw?.text).toBe('');
    expect(note.frontmatterRaw?.parseError).toBeUndefined();
  });

  it('when the YAML is malformed, records a parse error and does not throw', async () => {
    const note = parseNoteContent({ content: await readFixture('malformed-yaml.md') });

    expect(note.frontmatter).toBeNull();
    expect(note.frontmatterRaw?.parseError).toBeDefined();
    expect(typeof note.frontmatterRaw?.parseError).toBe('string');
  });

  it('when frontmatter uses irregular spacing and block-style tags, parses fields normally', async () => {
    const note = parseNoteContent({ content: await readFixture('unusual-whitespace.md') });

    expect(note.frontmatter?.title).toBe('Note with irregular spacing');
    expect(note.frontmatter?.type).toBe('howto');
    expect(note.frontmatter?.tags).toEqual(['git', 'whitespace']);
  });

  it('when a note carries optional fields, preserves them in the extra map', async () => {
    const note = parseNoteContent({ content: await readFixture('with-extra-fields.md') });

    expect(note.frontmatter?.extra).toEqual({
      'last-verified': '2026-05-10',
      'applies-to': ['git 2.45+', 'Bitbucket Cloud'],
      sources: ['https://git-scm.com/docs/git-rebase'],
    });
  });

  it('keeps a YYYY-MM-DD date field as a string rather than a Date object', () => {
    const note = parseNoteContent({
      content: [
        '---',
        'title: Dated note',
        'type: howto',
        'created: 2026-05-14',
        'updated: 2026-05-14',
        'tags: []',
        '---',
        '',
      ].join('\n'),
    });

    expect(typeof note.frontmatter?.created).toBe('string');
    expect(note.frontmatter?.created).toBe('2026-05-14');
  });

  it('records the body start line after the closing fence', async () => {
    const note = parseNoteContent({ content: await readFixture('howto-typical.md') });

    expect(note.bodyStartLine).toBe(8);
    expect(note.body).toMatch(/^\n# How to rebase onto main/);
  });

  it('reports the closing fence line in the raw slice metadata', async () => {
    const note = parseNoteContent({ content: await readFixture('howto-typical.md') });

    expect(note.frontmatterRaw?.startLine).toBe(1);
    expect(note.frontmatterRaw?.endLine).toBe(7);
  });

  it('when only an opening fence exists, treats the note as frontmatter-free', () => {
    const note = parseNoteContent({ content: '---\ntitle: never closed\n\nbody text' });

    expect(note.frontmatter).toBeNull();
    expect(note.frontmatterRaw).toBeNull();
  });
});

describe(parseNote, () => {
  it('reads a note from disk and parses its frontmatter', async () => {
    const note = await parseNote({ path: join(FIXTURES_DIR, 'howto-typical.md') });

    expect(note.path).toBe(join(FIXTURES_DIR, 'howto-typical.md'));
    expect(note.frontmatter?.title).toBe('How to rebase onto main');
  });

  it('throws when the note file does not exist', async () => {
    await expect(parseNote({ path: join(FIXTURES_DIR, 'does-not-exist.md') })).rejects.toThrow();
  });
});

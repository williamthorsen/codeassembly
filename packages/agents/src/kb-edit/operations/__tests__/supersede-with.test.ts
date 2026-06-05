import type { AliasMap, Frontmatter, ParsedNote } from '@codeassembly/kb';
import { describe, expect, it } from 'vitest';

import { prepareSupersedeWith } from '../supersede-with.ts';

const NOW = new Date('2026-05-24T14:35:00Z');
const KB_PATH = '/tmp/vault';

function note(input: { name: string; tags?: string[]; extra?: Record<string, unknown> }): ParsedNote {
  const tags = input.tags ?? ['example'];
  const extra = input.extra ?? {};
  const frontmatter: Frontmatter = {
    title: input.name.replace(/\.md$/, ''),
    type: 'howto',
    created: '2026-05-01',
    updated: '2026-05-01',
    tags,
    extra,
  };
  return {
    path: `${KB_PATH}/${input.name}`,
    content: '',
    frontmatter,
    frontmatterRaw: { text: '', startLine: 1, endLine: 6 },
    body: '\nBody.\n',
    bodyStartLine: 7,
  };
}

function frontmatterOf(parsed: ParsedNote): Frontmatter {
  if (parsed.frontmatter === null) {
    throw new Error('test setup: expected non-null frontmatter');
  }
  return parsed.frontmatter;
}

const NO_ALIASES: AliasMap = new Map();

describe(prepareSupersedeWith, () => {
  it('writes superseded-by on old, supersedes on new, and adds deprecated to old', () => {
    const oldNote = note({ name: 'old.md' });
    const newNote = note({ name: 'new.md' });

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.frontmatter.extra['superseded-by']).toBe('new.md');
    expect(result.new.frontmatter.extra.supersedes).toBe('old.md');
    expect(result.old.frontmatter.tags).toContain('deprecated');
  });

  it('bumps updated on both notes', () => {
    const oldNote = note({ name: 'old.md' });
    const newNote = note({ name: 'new.md' });

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.frontmatter.updated).toBe('2026-05-24');
    expect(result.new.frontmatter.updated).toBe('2026-05-24');
  });

  it('writes KB-relative pointers when notes are in subfolders', () => {
    const oldNote: ParsedNote = { ...note({ name: 'old.md' }), path: `${KB_PATH}/legacy/old.md` };
    const newNote: ParsedNote = { ...note({ name: 'new.md' }), path: `${KB_PATH}/current/new.md` };

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.frontmatter.extra['superseded-by']).toBe('current/new.md');
    expect(result.new.frontmatter.extra.supersedes).toBe('legacy/old.md');
  });

  it('is idempotent when deprecated tag is already present', () => {
    const oldNote = note({ name: 'old.md', tags: ['legacy', 'deprecated'] });
    const newNote = note({ name: 'new.md' });

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.frontmatter.tags.filter((t) => t === 'deprecated')).toHaveLength(1);
    expect(result.old.frontmatter.tags).toEqual(['legacy', 'deprecated']);
  });

  it('canonicalizes deprecated through the alias map before adding it', () => {
    const aliases: AliasMap = new Map([['deprecated', 'archived']]);
    const oldNote = note({ name: 'old.md', tags: ['legacy'] });
    const newNote = note({ name: 'new.md' });

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases,
      now: NOW,
    });

    expect(result.old.frontmatter.tags).toEqual(['legacy', 'archived']);
  });

  it('preserves other extra fields on both notes', () => {
    const oldNote = note({ name: 'old.md', extra: { 'applies-to': 'node 22' } });
    const newNote = note({ name: 'new.md', extra: { 'last-verified': '2026-04-15' } });

    const result = prepareSupersedeWith({
      oldNote,
      oldFrontmatter: frontmatterOf(oldNote),
      newNote,
      newFrontmatter: frontmatterOf(newNote),
      kbPath: KB_PATH,
      aliases: NO_ALIASES,
      now: NOW,
    });

    expect(result.old.frontmatter.extra['applies-to']).toBe('node 22');
    expect(result.new.frontmatter.extra['last-verified']).toBe('2026-04-15');
  });
});

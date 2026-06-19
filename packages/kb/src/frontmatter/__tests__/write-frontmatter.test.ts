import { describe, expect, it } from 'vitest';

import type { Frontmatter } from '../../types.ts';
import { parseNoteContent } from '../parse-note.ts';
import { writeFrontmatter } from '../write-frontmatter.ts';

describe(writeFrontmatter, () => {
  it('emits required fields in the fixed title/recordType/created/updated/tags order', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter(), body: '# Body' });
    const lines = output.split('\n');

    expect(lines.slice(0, 6)).toEqual([
      '---',
      'title: How to rebase onto main',
      'recordType: assertion',
      'created: 2026-05-01T08:14:22Z',
      'updated: 2026-05-14T13:47:05Z',
      'tags: [git, rebase]',
    ]);
  });

  it('renders tags as a flow-style sequence', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ tags: ['a', 'b', 'c'] }), body: '' });

    expect(output).toContain('tags: [a, b, c]');
  });

  it('renders an empty tags list as tags: [] that re-parses to an empty list', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ tags: [] }), body: '' });

    expect(output).toContain('tags: []');
    expect(parseNoteContent({ content: output }).frontmatter?.tags).toEqual([]);
  });

  it('round-trips a title that starts with a leading hyphen', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ title: '-hyphen start' }), body: '' });

    expect(parseNoteContent({ content: output }).frontmatter?.title).toBe('-hyphen start');
  });

  it('places one blank line between the closing fence and the body', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter(), body: '# Heading' });

    expect(output).toMatch(/---\n\n# Heading$/);
  });

  it('single-quotes a title that contains a colon-space run', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ title: 'Topic: a subtitle' }), body: '' });

    expect(output).toContain("title: 'Topic: a subtitle'");
  });

  it('single-quotes a title that starts with an unsafe character', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ title: '@mention note' }), body: '' });

    expect(output).toContain("title: '@mention note'");
  });

  it('leaves a plain alphanumeric title unquoted', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter({ title: 'Plain title' }), body: '' });

    expect(output).toContain('title: Plain title');
  });

  it('emits extra fields after the required core in insertion order', () => {
    const frontmatter = makeFrontmatter({
      extra: { 'last-verified': '2026-05-10T10:05:47Z', 'applies-to': ['git 2.45+'] },
    });
    const output = writeFrontmatter({ frontmatter, body: '' });
    const lines = output.split('\n');

    expect(lines[6]).toBe('last-verified: 2026-05-10T10:05:47Z');
    expect(lines[7]).toBe('applies-to: [git 2.45+]');
  });

  it('drops a single leading newline from the body so spacing stays canonical', () => {
    const output = writeFrontmatter({ frontmatter: makeFrontmatter(), body: '\n# Already spaced' });

    expect(output).toMatch(/---\n\n# Already spaced$/);
  });
});

// region | Helpers

function makeFrontmatter(overrides: Partial<Frontmatter> = {}): Frontmatter {
  return {
    title: 'How to rebase onto main',
    recordType: 'assertion',
    created: '2026-05-01T08:14:22Z',
    updated: '2026-05-14T13:47:05Z',
    tags: ['git', 'rebase'],
    extra: {},
    ...overrides,
  };
}

// endregion | Helpers

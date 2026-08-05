import { describe, expect, it } from 'vitest';

import { readNoteContent } from '../read-note.ts';

describe(readNoteContent, () => {
  it('splits frontmatter fields from the body', () => {
    const { fields, body, error } = readNoteContent('---\ntitle: A note\ntags: [git]\n---\n\nThe body.\n');
    expect(error).toBeUndefined();
    expect(fields).toEqual({ title: 'A note', tags: ['git'] });
    expect(body.trim()).toBe('The body.');
  });

  it('reports an error when there is no frontmatter block', () => {
    const { error } = readNoteContent('Just a body, no fences.\n');
    expect(error).toBeDefined();
  });

  it('propagates a YAML parse error from the frontmatter', () => {
    const { error } = readNoteContent('---\ntitle: [unterminated\n---\n\nbody\n');
    expect(error).toBeDefined();
  });
});

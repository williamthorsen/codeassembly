import { describe, expect, it } from 'vitest';

import { parseNoteContent } from '../../frontmatter/parse-note.ts';
import { buildVaultIndex } from '../build-vault-index.ts';

function note(path: string) {
  return parseNoteContent({ content: '# body', path });
}

describe(buildVaultIndex, () => {
  it('returns an empty index for no notes', () => {
    expect(buildVaultIndex([])).toEqual(new Map());
  });

  it('maps a note basename without .md to its path', () => {
    const index = buildVaultIndex([note('engineering/Foo.md')]);
    expect(index.get('Foo')).toEqual(new Set(['engineering/Foo.md']));
  });

  it('groups notes that share a basename under one key', () => {
    const index = buildVaultIndex([note('engineering/Foo.md'), note('tools/Foo.md')]);
    expect(index.get('Foo')).toEqual(new Set(['engineering/Foo.md', 'tools/Foo.md']));
  });

  it('keys on the final path segment for nested paths', () => {
    const index = buildVaultIndex([note('a/b/c/Deep note.md')]);
    expect(index.get('Deep note')).toEqual(new Set(['a/b/c/Deep note.md']));
  });
});

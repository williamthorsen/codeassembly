import { describe, expect, it } from 'vitest';

import { enumerateNotes } from '../../../check/enumerate.ts';
import { defaultKbConfig } from '../../../config/config-schema.ts';
import { makeTree } from '../../../test-utils/scaffolding.ts';
import { selectNotes } from '../select-notes.ts';

const NOTE =
  '---\ntitle: A\nrecordType: assertion\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: [x]\n---\n\nBody.\n';

/** A store whose `content/` holds three notes plus dirs and files that are not validatable notes. */
const FILES: Record<string, string> = {
  'content/assertions/Alpha.md': NOTE,
  'content/assertions/Beta.md': NOTE,
  'content/events/Gamma.md': NOTE,
  'content/assets/logo.png': 'binary', // a directory whose only file is not a note
  'content/data/info.json': '{}', // a directory backing a glob that matches no note
  'README.md': '# readme', // a real file that is not a validatable note
};

/** Builds a real store from `FILES`, enumerates it, and resolves `patterns` against the result. */
async function select(patterns: string[]): Promise<{ selected: string[]; unmatched: string[] }> {
  const root = await makeTree(FILES);
  const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });
  const result = await selectNotes({ notes, patterns, storeRoot: root });
  return { selected: result.selected.map((entry) => entry.relativePath), unmatched: result.unmatched };
}

describe(selectNotes, () => {
  it('selects exactly the notes a glob matches', async () => {
    const { selected, unmatched } = await select(['content/assertions/**']);

    expect(selected.toSorted()).toEqual(['content/assertions/Alpha.md', 'content/assertions/Beta.md']);
    expect(unmatched).toEqual([]);
  });

  it('selects every note beneath a bare directory', async () => {
    const { selected } = await select(['content/assertions']);

    expect(selected.toSorted()).toEqual(['content/assertions/Alpha.md', 'content/assertions/Beta.md']);
  });

  it('selects every note beneath a directory given with a trailing slash', async () => {
    const { selected } = await select(['content/assertions/']);

    expect(selected.toSorted()).toEqual(['content/assertions/Alpha.md', 'content/assertions/Beta.md']);
  });

  it('selects a single note given its literal path', async () => {
    const { selected } = await select(['content/events/Gamma.md']);

    expect(selected).toEqual(['content/events/Gamma.md']);
  });

  it('deduplicates overlapping patterns and preserves enumeration order', async () => {
    const root = await makeTree(FILES);
    const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });
    const enumerationOrder = notes.map((entry) => entry.relativePath);

    const result = await selectNotes({
      notes,
      patterns: ['content/events/Gamma.md', 'content/**/*.md'],
      storeRoot: root,
    });

    expect(result.selected.map((entry) => entry.relativePath)).toEqual(enumerationOrder);
  });

  it('reports a nonexistent literal path as unmatched', async () => {
    const { selected, unmatched } = await select(['content/assertions/Missing.md']);

    expect(selected).toEqual([]);
    expect(unmatched).toEqual(['content/assertions/Missing.md']);
  });

  it('silently drops a real file that is not a validatable note', async () => {
    const { selected, unmatched } = await select(['README.md']);

    expect(selected).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  it('silently drops a directory that contains no validatable notes', async () => {
    const { selected, unmatched } = await select(['content/assets']);

    expect(selected).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  it('silently drops a glob whose literal prefix exists but matches no notes', async () => {
    const { selected, unmatched } = await select(['content/data/**']);

    expect(selected).toEqual([]);
    expect(unmatched).toEqual([]);
  });

  it('reports a glob whose literal prefix does not exist as unmatched', async () => {
    const { selected, unmatched } = await select(['content/nope/**']);

    expect(selected).toEqual([]);
    expect(unmatched).toEqual(['content/nope/**']);
  });

  it('selects only the literal note when its name contains glob metacharacters', async () => {
    // `[v2]` is a character class as a glob, so picomatch would also match the sibling `Draft2.md`;
    // an exact path must select only the named note.
    const root = await makeTree({
      'content/Draft[v2].md': NOTE,
      'content/Draft2.md': NOTE,
      'content/Plain.md': NOTE,
    });
    const notes = await enumerateNotes({ kbRoot: root, config: defaultKbConfig });

    const result = await selectNotes({ notes, patterns: ['content/Draft[v2].md'], storeRoot: root });

    expect(result.selected.map((entry) => entry.relativePath)).toEqual(['content/Draft[v2].md']);
    expect(result.unmatched).toEqual([]);
  });
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { buildIncludeGraph } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// A partial exists to share text, so the `_partials` README admits one only when two or more files include it, and
// merges partials that the same files include unless a host's own text separates them. The README lists each group
// kept apart, and these assertions keep the corpus and the list in agreement.

const README = '_partials/README.md';

/** The README heading whose bullets name the groups of partials kept apart. */
const KEPT_APART_HEADING = '### Partials kept apart';

const INCLUDERS = mapPartialIncluders();

describe('partial consumers', () => {
  it('includes every partial from two or more files', async () => {
    const violations = [...(await INCLUDERS)]
      .filter(([, includers]) => includers.size < 2)
      .map(([partial, includers]) => `${partial} <- ${[...includers].join(', ') || 'nothing'}`);

    const message = `A partial included by one file is that file's own text; inline it back:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('lists every group of partials that the same files include', async () => {
    const groups = await readKeptApartGroups();
    const violations = listSharedIncluderGroups(await INCLUDERS)
      .filter((group) => groups.every((listed) => group.some((partial) => !listed.includes(partial))))
      .map((group) => group.join(', '));

    const message = `Partials that the same files include are one partial, or ${README} lists them under "${KEPT_APART_HEADING}" with the host text that separates them:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  it('names only existing partials in the list', async () => {
    const partials = new Set((await INCLUDERS).keys());
    const violations = (await readKeptApartGroups()).flat().filter((partial) => !partials.has(partial));

    expect(violations, `${README} lists partials that do not exist`).toEqual([]);
  });
});

// region | Helpers

/** Groups the partials whose sets of includers are identical, returning each group of two or more. */
function listSharedIncluderGroups(includers: ReadonlyMap<string, ReadonlySet<string>>): Array<Array<string>> {
  const groups = new Map<string, Array<string>>();
  for (const [partial, files] of includers) {
    const key = [...files].toSorted().join('\n');
    groups.set(key, [...(groups.get(key) ?? []), partial]);
  }
  return groups
    .values()
    .filter((group) => group.length >= 2)
    .toArray();
}

/**
 * Maps every partial, by content-root-relative path, to the files whose directives include it, taken from the include
 * graph that the expander resolves.
 */
async function mapPartialIncluders(): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const graph = await buildIncludeGraph(CONTENT_ROOT);
  const files = await listMarkdownFiles(CONTENT_ROOT);
  const includers = new Map<string, Set<string>>();

  for (const file of files) {
    const relativePath = path.relative(CONTENT_ROOT, file);
    if (relativePath.split(path.sep).includes('_partials') && path.basename(file) !== 'README.md') {
      includers.set(relativePath, new Set());
    }
  }

  for (const file of files) {
    for (const edge of graph.listClosure(file).includes) {
      includers.get(path.relative(CONTENT_ROOT, edge.file))?.add(path.relative(CONTENT_ROOT, edge.includer));
    }
  }

  return includers;
}

/** Returns the partials named by each bullet of the README's kept-apart list: the code spans before its first colon. */
async function readKeptApartGroups(): Promise<Array<Array<string>>> {
  const lines = (await readFile(path.join(CONTENT_ROOT, README), 'utf8')).split('\n');
  const start = lines.indexOf(KEPT_APART_HEADING);
  if (start === -1) throw new Error(`${README} does not contain ${KEPT_APART_HEADING}`);

  const groups: Array<Array<string>> = [];
  const section = lines.slice(start + 1);
  for (const line of section) {
    if (line.startsWith('#')) break;
    if (!line.startsWith('- ')) continue;

    const names = line.slice(0, line.indexOf(':')).matchAll(/`([^`]+)`/g);
    groups.push([...names].flatMap((match) => match[1] ?? []));
  }
  return groups;
}

// endregion | Helpers

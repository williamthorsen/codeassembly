import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { renderContentRoot, type RenderedTree } from 'codeassembly/api';
import { beforeAll, describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';

// The recipe quotes deployment markers verbatim so that a reader can match one by sight, and nothing but this suite
// ties those quotations to the code that writes them. Every expected string here is read from a render of the marker
// fixture root, never restated as a literal, because a second copy of a literal drifts alongside the first.

const RECIPE_PATH = path.join(CONTENT_ROOT, 'skills', '_data', 'deployed-file-provenance.md');

/**
 * A root shipping one of each marked artifact: a skill, a subagent, a rulebook delivered both as a skill and ambient,
 * two support files on either side of the frontmatter branch, and a guidance template with an ambient region.
 */
const MARKER_ROOT = path.join(import.meta.dirname, 'fixtures', 'marker-root');

/**
 * The slug of every artifact in the fixture root, so that the lines stamped by a producer can be found and rewritten
 * into the placeholder that the recipe uses.
 */
const SENTINEL_SLUG = 'sentinel-artifact';

/** The placeholder written by the recipe in place of an artifact's own slug in a deployed marker. */
const SLUG_PLACEHOLDER = '{slug}';

/**
 * The version declared by the fixture rulebook, so that the line stamped by a producer can be rewritten into the
 * recipe's placeholder.
 */
const SENTINEL_VERSION = 'sentinel-version';

/** The placeholder written by the recipe in place of a rulebook's own version in the version line. */
const VERSION_PLACEHOLDER = '{version}';

/** Each file carrying an ownership marker stamped by `sync`, with the number of its lines that contain the slug. */
const OWNERSHIP_MARKER_CASES: ReadonlyArray<{ deployedPath: string; label: string; markerCount: number }> = [
  { deployedPath: 'skills/sentinel-artifact/SKILL.md', label: 'skill', markerCount: 1 },
  { deployedPath: 'agents/sentinel-artifact.md', label: 'subagent', markerCount: 1 },
  { deployedPath: 'skills/fixture-skill/SKILL.md', label: 'rulebook skill', markerCount: 1 },
  // The ambient block opens and closes with a line containing the slug, and the recipe quotes both.
  { deployedPath: 'CLAUDE.md', label: 'rulebook block', markerCount: 2 },
];

/** One support file per shape on which the provenance marker written by `install` branches. */
const PROVENANCE_CASES: ReadonlyArray<{ deployedPath: string; label: string }> = [
  { deployedPath: 'skills/_data/frontmatter.md', label: 'frontmatter' },
  { deployedPath: 'skills/_data/bare.md', label: 'bare' },
];

/** The fixture root's Claude render, read once for every case below. */
const RENDERED = renderContentRoot(MARKER_ROOT, { harness: 'claude' });

describe('deployment markers', () => {
  let recipe: string;
  let tree: RenderedTree;

  beforeAll(async () => {
    recipe = await readFile(RECIPE_PATH, 'utf8');
    tree = await RENDERED;
  });

  it.each(OWNERSHIP_MARKER_CASES)('quotes the $label ownership marker', ({ deployedPath, label, markerCount }) => {
    const markers = listDocumentedMarkers(readRendered(tree, deployedPath), markerCount);

    for (const [index, marker] of markers.entries()) {
      expect(recipe, `${label} marker ${index + 1}`).toContain(marker);
    }
  });

  it.each(PROVENANCE_CASES)('quotes the $label provenance headline', async ({ deployedPath }) => {
    const source = await readFile(path.join(MARKER_ROOT, deployedPath), 'utf8');

    expect(recipe).toContain(takeFirstAddedLine(source, readRendered(tree, deployedPath)));
  });

  it('quotes both delimiters of the ambient region', () => {
    const delimiters = readRendered(tree, 'CLAUDE.md')
      .split('\n')
      .filter((line) => /^<!-- codeassembly-ambient:[a-z]+ -->$/.test(line));

    expect(delimiters).toHaveLength(2);
    for (const delimiter of delimiters) {
      expect(recipe).toContain(delimiter);
    }
  });

  it('quotes the rulebook version line', () => {
    const lines = readRendered(tree, 'skills/fixture-skill/SKILL.md')
      .split('\n')
      .filter((line) => line.includes(SENTINEL_VERSION));

    expect(lines).toHaveLength(1);
    expect(recipe).toContain(lines.join('').replaceAll(SENTINEL_VERSION, () => VERSION_PLACEHOLDER));
  });

  // The render anchors links at the harness home, as `install` does, so it does not produce the directory under which
  // `sync` places a declared source's support entries.
  it('names the source-support directory as deployment writes it', () => {
    expect(recipe).toContain('_sources/');
  });
});

// region | Helpers

/** Returns a rendered file's text, throwing when the render does not contain it. */
function readRendered(tree: RenderedTree, deployedPath: string): string {
  const entry = tree[deployedPath];
  if (entry === undefined) {
    throw new Error(`The marker root's render does not contain ${deployedPath}`);
  }
  return entry.content;
}

/**
 * Returns the rendered lines containing the sentinel slug, each with the sentinel rewritten as the recipe's
 * placeholder. Throws unless the count matches, so a producer that stamps the slug somewhere new fails here rather
 * than silently comparing the wrong line.
 */
function listDocumentedMarkers(rendered: string, expectedCount: number): ReadonlyArray<string> {
  const markers = rendered
    .split('\n')
    .filter((line) => line.includes(SENTINEL_SLUG))
    .map((line) => line.replaceAll(SENTINEL_SLUG, () => SLUG_PLACEHOLDER));
  if (markers.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} line(s) containing "${SENTINEL_SLUG}", found ${markers.length}.`);
  }
  return markers;
}

/** Returns the first line present in `after` but not in `before`, which is the opening line of an injected block. */
function takeFirstAddedLine(before: string, after: string): string {
  const original = new Set(before.split('\n'));
  const added = after.split('\n').find((line) => !original.has(line));
  if (added === undefined) {
    throw new Error('Expected the injected content to add at least one line.');
  }
  return added;
}

// endregion | Helpers

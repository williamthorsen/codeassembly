import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { AMBIENT_CLOSE_MARKER, AMBIENT_OPEN_MARKER } from '../../src/lib/ambient-region.ts';
import { makeArtifactMarker } from '../../src/lib/artifact-marker.ts';
import { SOURCE_SUPPORT_DIR } from '../../src/lib/link-anchor.ts';
import { injectProvenanceMarker } from '../../src/lib/marker-injector.ts';
import { renderSkillFile } from '../../src/lib/rulebook-skill.ts';
import { renderRulebookVersionLines } from '../../src/lib/rulebook-version-line.ts';
import { injectRulebook } from '../../src/lib/sentinel-inliner.ts';

// The recipe quotes deployment markers verbatim so a reader can match one by sight, and nothing but this suite ties
// those quotations to the code that writes them. Every expected string here is produced by calling the real injector,
// never restated as a literal, because a second copy of a literal drifts alongside the first.

const RECIPE_PATH = path.join(
  new URL('../', import.meta.url).pathname,
  'skills',
  '_data',
  'deployed-file-provenance.md',
);

const BARE_FIXTURE = '# Fixture\n';
const FRONTMATTER_FIXTURE = '---\nname: fixture\n---\nBody line.\n';
const FIXTURE_SOURCE_URL = 'https://example.invalid/fixture.md';

/** Stands in for a slug, so the lines a producer stamps can be found and rewritten into the placeholder the recipe uses. */
const SENTINEL_SLUG = 'sentinel-artifact';

/** The placeholder the recipe writes where a deployed marker contains an artifact's own slug. */
const SLUG_PLACEHOLDER = '{slug}';

/** Stands in for a declared version, so the line a producer stamps can be rewritten into the recipe's placeholder. */
const SENTINEL_VERSION = 'sentinel-version';

/** The placeholder the recipe writes where the version line contains a rulebook's own version. */
const VERSION_PLACEHOLDER = '{version}';

describe('deployment markers', () => {
  let recipe: string;

  beforeAll(async () => {
    recipe = await readFile(RECIPE_PATH, 'utf8');
  });

  it.each(buildOwnershipMarkerCases())('quotes the $label ownership marker', ({ marker }) => {
    expect(recipe).toContain(marker);
  });

  it.each(buildProvenanceHeadlineCases())('quotes the $label provenance headline', ({ headline }) => {
    expect(recipe).toContain(headline);
  });

  it.each(buildRegionDelimiterCases())('quotes the $label region delimiter', ({ delimiter }) => {
    expect(recipe).toContain(delimiter);
  });

  it('quotes the rulebook version line', () => {
    const line = renderRulebookVersionLines(SENTINEL_VERSION)
      .join('')
      .replaceAll(SENTINEL_VERSION, () => VERSION_PLACEHOLDER);

    expect(recipe).toContain(line);
  });

  it('names the source-support directory as deployment writes it', () => {
    expect(recipe).toContain(`${SOURCE_SUPPORT_DIR}/`);
  });
});

// region | Helpers

/** Produces each ownership marker `sync` stamps, in the placeholder form the recipe quotes. */
function buildOwnershipMarkerCases(): ReadonlyArray<{ label: string; marker: string }> {
  const producers = [
    {
      label: 'skill',
      markerCount: 1,
      rendered: makeArtifactMarker('skill').injectMarker(FRONTMATTER_FIXTURE, SENTINEL_SLUG),
    },
    {
      label: 'subagent',
      markerCount: 1,
      rendered: makeArtifactMarker('subagent').injectMarker(FRONTMATTER_FIXTURE, SENTINEL_SLUG),
    },
    {
      label: 'rulebook skill',
      markerCount: 1,
      rendered: renderSkillFile({
        body: 'Body line.',
        description: 'Fixture rulebook.',
        skillName: 'fixture-skill',
        slug: SENTINEL_SLUG,
        version: undefined,
      }),
    },
    // `injectRulebook` opens and closes the block, so both lines contain the slug and the recipe quotes both.
    { label: 'rulebook block', markerCount: 2, rendered: injectRulebook('', SENTINEL_SLUG, 'Body line.') },
  ];

  return producers.flatMap(({ label, markerCount, rendered }) =>
    listDocumentedMarkers(rendered, markerCount).map((marker, index) => ({
      label: markerCount === 1 ? label : `${label} ${index + 1}`,
      marker,
    })),
  );
}

/** Produces the opening line of each provenance marker `install` writes, one per fixture shape it branches on. */
function buildProvenanceHeadlineCases(): ReadonlyArray<{ label: string; headline: string }> {
  return [
    {
      label: 'frontmatter',
      headline: takeFirstAddedLine(
        FRONTMATTER_FIXTURE,
        injectProvenanceMarker(FRONTMATTER_FIXTURE, FIXTURE_SOURCE_URL),
      ),
    },
    {
      label: 'bare',
      headline: takeFirstAddedLine(BARE_FIXTURE, injectProvenanceMarker(BARE_FIXTURE, FIXTURE_SOURCE_URL)),
    },
  ];
}

/** Produces the delimiters bounding the ambient region `sync` rewrites inside a guidance file. */
function buildRegionDelimiterCases(): ReadonlyArray<{ label: string; delimiter: string }> {
  return [
    { delimiter: AMBIENT_OPEN_MARKER, label: 'ambient open' },
    { delimiter: AMBIENT_CLOSE_MARKER, label: 'ambient close' },
  ];
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

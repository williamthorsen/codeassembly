import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { makeArtifactMarker } from '../../src/lib/artifact-marker.ts';
import { SOURCE_SUPPORT_DIR } from '../../src/lib/link-anchor.ts';
import { injectProvenanceMarker } from '../../src/lib/marker-injector.ts';
import { renderSkillFile } from '../../src/lib/rulebook-skill.ts';

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

/** Stands in for a slug, so the line a producer stamps can be found and rewritten into the placeholder the recipe uses. */
const SENTINEL_SLUG = 'sentinel-artifact';

/** The placeholder the recipe writes where a deployed marker carries an artifact's own slug. */
const SLUG_PLACEHOLDER = '{slug}';

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

  it('names the source-support directory as deployment writes it', () => {
    expect(recipe).toContain(`${SOURCE_SUPPORT_DIR}/`);
  });
});

// region | Helpers

/** Produces each ownership marker `sync` stamps, in the placeholder form the recipe quotes. */
function buildOwnershipMarkerCases(): ReadonlyArray<{ label: string; marker: string }> {
  return [
    {
      label: 'skill',
      marker: findDocumentedMarker(makeArtifactMarker('skill').injectMarker(FRONTMATTER_FIXTURE, SENTINEL_SLUG)),
    },
    {
      label: 'subagent',
      marker: findDocumentedMarker(makeArtifactMarker('subagent').injectMarker(FRONTMATTER_FIXTURE, SENTINEL_SLUG)),
    },
    {
      label: 'rulebook',
      marker: findDocumentedMarker(renderSkillFile('fixture-skill', SENTINEL_SLUG, 'Fixture rulebook.', 'Body line.')),
    },
  ];
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

/**
 * Returns the rendered line carrying the sentinel slug, with the sentinel rewritten as the recipe's placeholder.
 * Throws unless exactly one line carries it, so a producer that stamps the slug somewhere new fails here rather than
 * silently comparing the wrong line.
 */
function findDocumentedMarker(rendered: string): string {
  const [marker, ...extra] = rendered.split('\n').filter((line) => line.includes(SENTINEL_SLUG));
  if (marker === undefined || extra.length > 0) {
    throw new Error(
      `Expected one line carrying "${SENTINEL_SLUG}", found ${marker === undefined ? 0 : 1 + extra.length}.`,
    );
  }
  return marker.replaceAll(SENTINEL_SLUG, () => SLUG_PLACEHOLDER);
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

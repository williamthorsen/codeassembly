import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// `## Details` and `## What` are two renderings of one entry list, and a later ticket parses the entries back out of
// the rendering. Two edits would defeat that quietly: under-specifying the rendering, which leaves the parser reading
// prose that varies per run, and restoring the coverage mandate, which is what made `## Details` a prose re-rendering
// of the diff. Neither fails at runtime -- each yields a plausible change summary -- so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/**
 * Phrases that a restored coverage mandate carries. The mandate required every fact in the lede to reappear in
 * `## Details` and forbade trimming either section, which together commissioned the prose re-rendering of the diff
 * that this pipeline was rebuilt to stop. Lowercased, so that a sentence's opening capital still matches.
 */
const COVERAGE_MANDATE_PHRASES: ReadonlyArray<string> = [
  'appears in `## details` too',
  'neither section is trimmed',
  'the full story (implementation mechanics)',
];

/**
 * Phrases stating the rendering exactly enough to parse back out: which subsections exist and in what order, what
 * each bullet is, and when a bullet carries its scopes. Lowercased, so that a sentence's opening capital still
 * matches.
 */
const RENDERING_PHRASES: ReadonlyArray<string> = [
  'one per distinct `type` among the entries',
  'one bullet per entry of that type',
  'order them by tier',
  'bare `#scope` tags',
  'when every entry names the same scopes, no bullet carries tags',
];

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'skills', 'summarize-change', 'SKILL.md'), CONTENT_ROOT);

describe('summarize-change contract', () => {
  it('states the `## Details` rendering', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = RENDERING_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The rendering is the encoding of the entries, and a later reader parses the entries back out of it rather ' +
      'than out of a second copy. A rendering stated loosely varies per run, so the parser has nothing fixed to ' +
      `read. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('mandates no coverage of the lede by `## Details`', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = COVERAGE_MANDATE_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      '`## What` is a selection of the same bullets that `## Details` renders, so coverage holds by construction ' +
      'and a mandate can only ask for more than the entries contain. That is what drew a prose re-rendering of the ' +
      `diff. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });
});

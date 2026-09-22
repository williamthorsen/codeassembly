import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// `## Details` renders the drafter's entries, `## What` carries the lede that the same drafter wrote, and a later
// ticket parses the entries back out of the rendering. Three edits would defeat that quietly: under-specifying the
// rendering, which leaves the parser reading prose that varies per run; restoring the coverage mandate, which is what
// made `## Details` a prose re-rendering of the diff; and composing `## What` in this session, which returns the
// weighting that the fresh-context dispatch removes. None fails at runtime -- each yields a plausible change summary
// -- so the guard has to be here.
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

/**
 * Phrases holding the skill to recording the entries as data: writing them to a file, consolidating the change's
 * record from that file, and ending the body with the rendered block. Without all three the entries reach the pull
 * request as prose alone, which is the state that recording them replaced. Lowercased, so that a sentence's opening
 * capital still matches.
 */
const ENTRY_RECORDING_PHRASES: ReadonlyArray<string> = [
  'entries-{timestamp}.yaml',
  'consolidate-entries --entries-file',
  '--entries-commit',
  "the body's last element",
];

/**
 * Phrases binding `## What` to the drafter's own `## Lede`. Lowercased, so that a sentence's opening capital still
 * matches.
 */
const LEDE_SOURCE_PHRASES: ReadonlyArray<string> = [
  "take the drafter's `## lede` section",
  'write nothing of your own into it',
];

/** Every subagent that this skill may dispatch, matched against the tokens that the installer rewrites. */
const PERMITTED_SUBAGENTS: ReadonlyArray<string> = ['entry-drafter'];

/** The token form by which a skill names a subagent to dispatch. */
const SUBAGENT_TOKEN = /\{subagent:([a-z][a-z0-9-]*)\}/g;

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

  it('records the entries, consolidates the record from them, and ends the body with the block', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = ENTRY_RECORDING_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The block is where the entries reach the pull request as data, and the consolidated record that the ' +
      'frontmatter carries is derived from them. Dropping any of these steps leaves the entries as prose alone, ' +
      `which reads as a working change summary. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('consolidates the frontmatter record from the entries rather than from the commits', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('the step-7 `consolidated_record`, consolidated from the change entries');
  });

  it('mandates no coverage of the lede by `## Details`', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = COVERAGE_MANDATE_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      'The lede and the entries answer at different lengths for one change, so a mandate that each fact in the ' +
      'first reappear in the second can only ask for more than the entries contain. That is what drew a prose ' +
      `re-rendering of the diff. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });

  it('takes `## What` from the drafter’s lede rather than composing it', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = LEDE_SOURCE_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The lede reaches the merge commit, the changelog, and the release notes, and it was written in a fresh ' +
      'context for the reader who meets the change without the entries. A skill left free to compose it writes a ' +
      `plausible one carrying this session's weighting. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('dispatches the drafter alone', async () => {
    const dispatched = [
      ...new Set((await EXPANDED).matchAll(SUBAGENT_TOKEN).map((match) => match[1] ?? '')),
    ].toSorted();

    const message =
      'Each dispatch runs a fresh context over the whole change, which is what the pipeline pays for. A second one ' +
      'on the lede path doubles that cost to rework text that the first already wrote for the same reader. These ' +
      `subagents are dispatched:\n  ${dispatched.join('\n  ')}`;
    expect(dispatched, message).toEqual([...PERMITTED_SUBAGENTS].toSorted());
  });
});

import { describe, expect, it } from 'vitest';

import { readContentFile } from '../test-utils/read-content-file.ts';

// `## Details` is rendered by `describe-change render-details` from the drafter's entries, and `## What` contains the
// lede that the same drafter wrote. Four edits would defeat that quietly: rendering `## Details` by hand, which drifts
// from the taxonomy's headings; restoring the coverage mandate, which is what made `## Details` a prose re-rendering of
// the diff; composing `## What` in this session, which returns the weighting that the fresh-context dispatch removes;
// and accepting evidence other than the diff, which lets the summary retell how the change came about. None fails at
// runtime -- each yields a plausible change summary -- so the guard has to be here.

/**
 * Phrases that the backstory form of the `## Why` guidance contains, which pointed the session at how the need arose.
 * Lowercased, so that a sentence's opening capital still matches.
 */
const BACKSTORY_WHY_PHRASES: ReadonlyArray<string> = ['motivation and background', 'what was wrong, what was missing'];

/**
 * Phrases that a restored coverage mandate contains. The mandate required every fact in the lede to reappear in
 * `## Details` and forbade trimming either section, which together commissioned the prose re-rendering of the diff
 * that this pipeline was rebuilt to stop. Lowercased, so that a sentence's opening capital still matches.
 */
const COVERAGE_MANDATE_PHRASES: ReadonlyArray<string> = [
  'appears in `## details` too',
  'neither section is trimmed',
  'the full story (implementation mechanics)',
];

/**
 * Phrases holding the skill to recording the entries as data: writing them to a file, consolidating the change's
 * record from that file, and ending the body with the rendered block. Without all three the entries reach the pull
 * request as prose alone, which is the state that recording them replaced. Lowercased, so that a sentence's opening
 * capital still matches.
 */
const ENTRY_RECORDING_PHRASES: ReadonlyArray<string> = [
  'entries-{timestamp}.yaml',
  '`text`, and `migration` when the entry has one, as the drafter returned them',
  'write each `text` and `migration` double-quoted',
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

/**
 * Phrases that a restored type ask contains. The ask let a close call under the work-type test reach the developer,
 * who holds less of the evidence than the session that applied the test. Lowercased, so that a sentence's opening
 * capital still matches.
 */
const TYPE_ASK_PHRASES: ReadonlyArray<string> = ['ask the developer only when', 'genuinely close'];

/** The phrase stating `## Why` as the purpose that the change serves. Lowercased, like the text it is matched against. */
const PURPOSE_WHY_PHRASE = 'the _purpose_ that the change serves in this repository';

/** The phrase that counts a claim supported by any source but the diff as unsupported. */
const UNSUPPORTED_SOURCE_PHRASE = 'only the commit log, the ticket, or this session supports';

/** Every subagent that this skill may dispatch, matched against the tokens that the installer rewrites. */
const PERMITTED_SUBAGENTS: ReadonlyArray<string> = ['entry-drafter'];

/** The token form by which a skill names a subagent to dispatch. */
const SUBAGENT_TOKEN = /\{subagent:([a-z][a-z0-9-]*)\}/g;

const EXPANDED = readContentFile('skills/summarize-change/SKILL.md');

describe('summarize-change contract', () => {
  it('renders `## Details` through `render-details` rather than by hand', async () => {
    const text = (await EXPANDED).toLowerCase();

    const message =
      'The headings come from the taxonomy only when the script renders them; a skill that states the rules for the ' +
      'agent to apply gets headings from the agent’s own conventions.';
    expect(text, message).toContain('render-details --entries-file');
  });

  it('records the entries, consolidates the record from them, and ends the body with the block', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = ENTRY_RECORDING_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The block is where the entries reach the pull request as data, and the consolidated record that the ' +
      'frontmatter records is derived from them. Dropping any of these steps leaves the entries as prose alone, ' +
      `which reads as a working change summary. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('consolidates the frontmatter record from the entries rather than from the commits', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('the step-7 `consolidated_record`, consolidated from the change entries');
  });

  it('does not mandate coverage of the lede by `## Details`', async () => {
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
      'The lede reaches the pull request and the merge commit, and it was written in a fresh context for ' +
      'the reader who meets the change without the entries. A skill left free to compose it writes a ' +
      `plausible one weighted by this session's judgment. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('verifies each passage against the diff alone', async () => {
    const message =
      'The commit log, the ticket, and the session each support a sentence about how the change came about, which ' +
      'the diff does not contradict. An audit that counts them as support passes the history as the change.';
    expect((await EXPANDED).toLowerCase(), message).toContain(UNSUPPORTED_SOURCE_PHRASE);
  });

  it('states `## Why` as purpose rather than backstory', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = BACKSTORY_WHY_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      'Guidance that asks for motivation and background points the session at how the need arose, which the ' +
      `repository's readers never met. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(text).toContain(PURPOSE_WHY_PHRASE);
    expect(found, message).toEqual([]);
  });

  it('decides each type rather than asking the developer', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = TYPE_ASK_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      'A type is a determination by the work-type test, which this session applies with the diff in hand. An ask ' +
      `hands the developer a close call with less of the evidence. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(text).toContain("set `type` to the test's result");
    expect(found, message).toEqual([]);
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

import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The drafter answers "What is this PR about?" from summary-shaped sources, in a form the author rates. Two inputs
// defeat that question, and both look like diligence when a later edit restores them: the diff, which makes every
// fact it holds feel load-bearing, and the doctrine, which turns the question into a rule list answered by
// including whatever it does not forbid. The form is defeated by a prescribed phrase, which the model emits
// wherever guidance names one, and by an unrated exemplar, every one of which is paragraph-form. None of these
// failures shows up at runtime -- each yields a plausible lede that catalogs the change -- so the guard has to be
// here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The drafter's assignment, which selects what it reports. */
const ASSIGNMENT_QUESTION = 'What is this PR about?';

/** The doctrine, written for the author and the auditor who read the draft rather than for the drafter. */
const DOCTRINE_FILENAME = 'lede-voice.md';

/** The exemplar call's quality floor, below which the corpus also returns the unrated records. */
const EXEMPLAR_QUALITY_FLOOR = '--min-quality strong';

/**
 * Phrases stating the bullet contract, which an edit restoring the paragraph form would lose. Lowercased, so a
 * sentence's opening capital still matches.
 */
const FORM_CONTRACT_PHRASES: ReadonlyArray<string> = [
  'bullet list',
  'one bullet per change',
  'one sentence',
  'the artifact the reader consumes',
  'third-person indicative present',
];

/** A `git diff` invocation that returns hunks: the bare form, or any form whose flags omit `--stat`. */
const HUNK_RETURNING_DIFF = /`git diff (?![^`]*--stat)[^`]*`/g;

/** A connective no lede prescribes, pinned as a literal because a rewording is how the prescription returns. */
const PRESCRIBED_CONNECTIVE = 'Separately,';

/**
 * Phrases naming each reader, which a rewrite dropping the audience would lose. Lowercased, so a doctrine bullet's
 * opening capital still matches.
 */
const READER_PHRASES: ReadonlyArray<string> = ['uses the package and does not work on it', 'works in this codebase'];

/** Each file stating the reader specification. The drafter never reads the doctrine, so each carries its own copy. */
const READER_SOURCES: ReadonlyArray<string> = [
  path.join('skills', '_data', DOCTRINE_FILENAME),
  path.join('subagents', 'lede-drafter.md'),
];

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'subagents', 'lede-drafter.md'), CONTENT_ROOT);

describe('lede-drafter contract', () => {
  it('asks the assignment question literally', async () => {
    const message =
      `The drafter's assignment is the question "${ASSIGNMENT_QUESTION}". Answering a question is bounded by the ` +
      'question; summarizing is bounded by the source, which is how a catalog gets written.';
    expect(await EXPANDED, message).toContain(ASSIGNMENT_QUESTION);
  });

  it.each(READER_SOURCES)('names both readers in %s', async (relativePath) => {
    const text = (await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT)).toLowerCase();
    const missing = READER_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The reader decides what the entry reports, and the doctrine and the drafter each state the readers, since ' +
      'the drafter never reads the doctrine. Revising one leaves the other naming a superseded reader. These ' +
      `phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('sends the drafter to no command returning diff hunks', async () => {
    const found = (await EXPANDED)
      .matchAll(HUNK_RETURNING_DIFF)
      .map((match) => match[0])
      .toArray();

    const message =
      'The drafter reads a diffstat, never the diff. A drafter holding the hunks answers what the change contains ' +
      "rather than what it is about, and the caller already checks the draft's claims against the diff. These " +
      `invocations return hunks:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });

  it('points the drafter at no doctrine to read before drafting', async () => {
    const message =
      `\`${DOCTRINE_FILENAME}\` is written for the author and the auditor who read the draft. Reading a rule list ` +
      'before writing turns the assignment into a checklist, which is answered by including everything it does ' +
      'not forbid.';
    expect(await EXPANDED, message).not.toContain(DOCTRINE_FILENAME);
  });

  it('draws exemplars from rated ledes alone', async () => {
    const message =
      `The exemplar call filters to \`${EXEMPLAR_QUALITY_FLOOR}\`. Without the floor the unrated records calibrate ` +
      'the draft alongside the rated ones, and every unrated record is paragraph-form.';
    expect(await EXPANDED, message).toContain(EXEMPLAR_QUALITY_FLOOR);
  });

  it('states the bullet contract', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = FORM_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The drafter is the only file that binds the writer, so a drafter that states no bullet contract drafts the ' +
      `paragraph the exemplars were rewritten out of. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('prescribes no connective phrase', async () => {
    const message =
      `A form named in guidance is a form the model emits, so "${PRESCRIBED_CONNECTIVE}" reaches the draft wherever ` +
      'the drafter names it. A second concern is a second bullet.';
    expect(await EXPANDED, message).not.toContain(PRESCRIBED_CONNECTIVE);
  });
});

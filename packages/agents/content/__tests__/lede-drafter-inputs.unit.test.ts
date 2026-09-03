import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The drafter answers "What is this PR about?" from summary-shaped sources. Two inputs defeat that question, and
// both look like diligence when a later edit restores them: the diff, which makes every fact it holds feel
// load-bearing, and the doctrine, which turns the question into a rule list answered by including whatever it does
// not forbid. Neither failure shows up at runtime -- each one yields a plausible lede that catalogs the change --
// so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The drafter's assignment, which selects what it reports. */
const ASSIGNMENT_QUESTION = 'What is this PR about?';

/** The doctrine, written for the author and the auditor who read the draft rather than for the drafter. */
const DOCTRINE_FILENAME = 'lede-voice.md';

/** A `git diff` invocation that returns hunks: the bare form, or any form whose flags omit `--stat`. */
const HUNK_RETURNING_DIFF = /`git diff (?![^`]*--stat)[^`]*`/g;

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

describe('lede-drafter inputs', () => {
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
});

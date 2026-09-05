import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The cutter deletes candidates and returns the survivors unchanged. Three edits would defeat that quietly: granting
// it a diff, which restores the attachment the fresh context removes; softening the deletion-only authority into a
// licence to reword, which the caller's byte-identity check then rejects on every run; and dropping the exemplar
// floor, which calibrates the cut against ledes the author never approved. None of the three fails at runtime -- each
// yields a plausible shorter lede -- so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The cutter's assignment, which selects what survives. */
const ASSIGNMENT_QUESTION = 'would this reader act on it?';

/** Phrases stating the deletion-only authority, which a rewrite granting the cutter a pen would lose. */
const AUTHORITY_PHRASES: ReadonlyArray<string> = [
  'you never reword a candidate',
  'you never merge two candidates',
  'you never add a candidate',
  'character for character',
];

/** The doctrine, written for the author and the auditor rather than for the cutter. */
const DOCTRINE_FILENAME = 'lede-voice.md';

/** The exemplar call's quality floor, without which the corpus also returns the records beneath it. */
const EXEMPLAR_QUALITY_FLOOR = '--min-quality strong';

/** The flag that returns the author's edit rather than the approved text alone. */
const EXEMPLAR_PAIR_FLAG = '--with-pair';

/** A `git diff` invocation that returns hunks: the bare form, or any form whose flags omit `--stat`. */
const HUNK_RETURNING_DIFF = /`git diff (?![^`]*--stat)[^`]*`/g;

/** The rule that keeps a cut usable by its caller, which `merge-pr` reads as a thin body when it is lost. */
const NONEMPTY_RULE_PHRASE = 'Return at least one candidate';

/**
 * Phrases naming each reader, which a rewrite dropping the audience would lose. Lowercased, so a sentence's opening
 * capital still matches.
 */
const READER_PHRASES: ReadonlyArray<string> = ['uses the package and does not work on it', 'works in this codebase'];

/** The instruction that closes the title-restating bullet, which is what #1559 reports. */
const TITLE_PHRASE = 'The title is already on the page';

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'subagents', 'lede-cutter.md'), CONTENT_ROOT);

describe('lede-cutter contract', () => {
  it('asks the assignment question literally', async () => {
    const message =
      `The cutter's assignment is the question "${ASSIGNMENT_QUESTION}". Judging each candidate against the reader ` +
      'is bounded by the reader; judging it against the change is bounded by the change, which keeps everything true.';
    expect(await EXPANDED, message).toContain(ASSIGNMENT_QUESTION);
  });

  it('names both readers', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = READER_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The reader decides which candidates survive, and the cutter never reads the doctrine that states them, so ' +
      `this file carries its own copy. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('states the deletion-only authority', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = AUTHORITY_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      "Deletion is the whole of the cutter's authority, and the caller rejects any bullet that is not one of the " +
      `candidates. A cutter told it may reword fails that check on every run. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('tells the cutter that the title is already on the page', async () => {
    const message =
      'Every surface renders the title above the lede, so a bullet restating it is the first cut. Without this the ' +
      'cutter weighs that bullet on its own merits, which is how the duplication survives.';
    expect(await EXPANDED, message).toContain(TITLE_PHRASE);
  });

  it('requires the cut to keep a candidate', async () => {
    const message =
      `\`${NONEMPTY_RULE_PHRASE}\` is what keeps the cut usable. \`merge-pr\` reads a \`## What\` under 30 ` +
      'characters as thin and composes a fresh body from the diff, so an emptied lede is rewritten by the auditor.';
    expect(await EXPANDED, message).toContain(NONEMPTY_RULE_PHRASE);
  });

  it('sends the cutter to no command returning diff hunks', async () => {
    const found = (await EXPANDED)
      .matchAll(HUNK_RETURNING_DIFF)
      .map((match) => match[0])
      .toArray();

    const message =
      'The cutter reads the candidates as the reader meets them, with nothing behind them. A cutter holding the ' +
      `hunks recovers the reasons the fresh context removed. These invocations return hunks:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });

  it('points the cutter at no doctrine to read before cutting', async () => {
    const message =
      `\`${DOCTRINE_FILENAME}\` is written for the author and the auditor who read the draft. A rule list turns the ` +
      'cut into a checklist, which is answered by keeping everything the list does not forbid.';
    expect(await EXPANDED, message).not.toContain(DOCTRINE_FILENAME);
  });

  it('draws exemplars from the author edits at the floor alone', async () => {
    const text = await EXPANDED;

    const message =
      `The exemplar call carries \`${EXEMPLAR_PAIR_FLAG}\`, which returns the author's edit rather than the ` +
      `approved text alone, and \`${EXEMPLAR_QUALITY_FLOOR}\`, without which every record beneath the floor ` +
      'calibrates the cut.';
    expect(text, message).toContain(EXEMPLAR_PAIR_FLAG);
    expect(text, message).toContain(EXEMPLAR_QUALITY_FLOOR);
  });
});

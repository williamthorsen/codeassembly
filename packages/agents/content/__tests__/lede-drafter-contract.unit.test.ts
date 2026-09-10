import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The drafter answers "What is this PR about?" from summary-shaped sources, in a form the author rates. The diff
// defeats that question and looks like diligence when a later edit restores it, because every fact it holds feels
// load-bearing. The form is defeated by a prescribed phrase, which the model emits wherever guidance names one, by an
// exemplar below the floor, every one of which is paragraph-form, and by a bullet unit that reads as one edit, whose
// split bullets no later actor may merge. None of these failures shows up at runtime -- each yields a plausible lede
// that catalogs the change -- so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The drafter's assignment, which selects what it reports. */
const ASSIGNMENT_QUESTION = 'What is this PR about?';

/**
 * Phrases fixing a bullet's scope to the outcome rather than to the edit. Where they are gone, "one bullet" reads as
 * one edit, and neither the caller's audit nor the deletion-only cutter may merge the bullets that reading splits.
 */
const BULLET_SCOPE_PHRASES: ReadonlyArray<string> = ['one bullet per outcome', 'not the edit that produced it'];

/** The exemplar call's quality floor, without which the corpus also returns the records beneath it. */
const EXEMPLAR_QUALITY_FLOOR = '--min-quality strong';

/**
 * Phrases stating the bullet contract, which an edit restoring the paragraph form would lose. Lowercased, so a
 * sentence's opening capital still matches.
 */
const FORM_CONTRACT_PHRASES: ReadonlyArray<string> = [
  'bullet list',
  'one sentence',
  'the artifact consumed by the reader',
  'third-person indicative present',
];

/** A `git diff` invocation that returns hunks: the bare form, or any form whose flags omit `--stat`. */
const HUNK_RETURNING_DIFF = /`git diff (?![^`]*--stat)[^`]*`/g;

/** The rule stating what a lede leaves out, which the drafter carries in place of the shared concision rule. */
const LEAVE_OUT_RULE_PHRASE = 'the question is never whether a fact is real';

/**
 * Phrases binding a migration paragraph to the edit, the trap, and the bound. The trap appears in no hunk, so a diff
 * review cannot recover it, and without the bound a migration grows a worked example per call shape.
 */
const MIGRATION_CONTRACT_PHRASES: ReadonlyArray<string> = [
  'any trap present in the replacement',
  'states the edit and the trap and stops there',
];

/**
 * Phrases deciding what a bullet names and how it marks it. Where they are gone, the kinds list reads as the whole
 * rule, so a token the reader never meets is backticked, and the internal call stands in for what the artifact does.
 */
const NAMING_RULE_PHRASES: ReadonlyArray<string> = [
  'never the internal call that the change edited',
  'what the reader consumes decides the marking',
];

/** A connective the drafter prescribes nowhere, pinned as a literal because a rewording is how it returns. */
const PRESCRIBED_CONNECTIVE = 'Separately,';

/** The phrase excluding how a change was produced, which a commit body carries and a bullet does not. */
const PROCESS_NARRATION_PHRASE = 'review mechanics, ticket and finding numbers';

/** The statement that the writer composes against a title the reader has already read. */
const TITLE_PHRASE = 'The title is already on the page';

/** Every code the caller redispatches under, each of which the drafter has to be able to act on. */
const REJECTION_CODES: ReadonlyArray<string> = ['subject', 'unmatched-return', 'unsupported-claim', 'voice'];

/**
 * Phrases naming each reader, which a rewrite dropping the audience would lose. Lowercased, so a doctrine bullet's
 * opening capital still matches.
 */
const READER_PHRASES: ReadonlyArray<string> = ['uses the package and does not work on it', 'works in this codebase'];

/**
 * Phrases binding a redispatch to the passages it was handed. Lowercased, so a sentence's opening capital still
 * matches.
 */
const REVISION_CONTRACT_PHRASES: ReadonlyArray<string> = [
  '`rejected` fence',
  'one replacement per passage',
  'revise those passages and nothing else',
];

/**
 * Phrases stating the subject test, which decides a bullet's subject without the doctrine. Lowercased, so a
 * sentence's opening capital still matches.
 */
const SUBJECT_TEST_PHRASES: ReadonlyArray<string> = [
  '"this pull request" in front of it',
  'the verb names what the system does rather than what the change did',
];

/** Each file stating the subject test: the drafter applies it, and the caller audits the draft against it. */
const SUBJECT_TEST_SOURCES: ReadonlyArray<string> = [
  path.join('skills', 'summarize-change', 'SKILL.md'),
  path.join('subagents', 'lede-drafter.md'),
];

/** The flag the exemplar call falls back to where the dispatch carries no type. */
const TIER_FALLBACK_FLAG = '--tier {tier}';

/**
 * Work types whose bullet owes a fact the assignment does not supply. Each is stated nowhere else, so a rewrite that
 * drops one leaves the drafter with no guidance at all on that type and every suite green.
 */
const TYPE_RULE_KEYS: ReadonlyArray<string> = ['ai', 'deps', 'deprecate', 'drop', 'fix', 'perf', 'refactor', 'sec'];

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'subagents', 'lede-drafter.md'), CONTENT_ROOT);

describe('lede-drafter contract', () => {
  it('asks the assignment question literally', async () => {
    const message =
      `The drafter's assignment is the question "${ASSIGNMENT_QUESTION}". Answering a question is bounded by the ` +
      'question; summarizing is bounded by the source, which is how a catalog gets written.';
    expect(await EXPANDED, message).toContain(ASSIGNMENT_QUESTION);
  });

  it('names both readers', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = READER_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The reader decides what the entry reports, and this file is the only one that states the readers to the ' +
      `writer. Where one is gone, the drafter writes for an audience nothing named. These phrases are gone:\n  ${missing.join('\n  ')}`;
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

  it('draws exemplars from ledes at the floor alone', async () => {
    const message =
      `The exemplar call filters to \`${EXEMPLAR_QUALITY_FLOOR}\`. Without the floor every record beneath it ` +
      'calibrates the draft, rated and unrated alike, and each of those is paragraph-form.';
    expect(await EXPANDED, message).toContain(EXEMPLAR_QUALITY_FLOOR);
  });

  it('keeps the floor on the fallback invocation', async () => {
    const found = (await EXPANDED)
      .split('\n')
      .filter((line) => line.includes(TIER_FALLBACK_FLAG) && !line.includes('--min-quality'));

    const message =
      `A dispatch carrying \`tier\` and no \`type\` is one \`summarize-change\` produces, so the fallback runs. A ` +
      `line naming \`${TIER_FALLBACK_FLAG}\` without the floor reads as the whole argument list, which returns the ` +
      `records the floor excludes. These lines drop it:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });

  it('states the bullet contract', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = FORM_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The drafter is the only file that binds the writer, so a drafter that states no bullet contract drafts the ' +
      `paragraph the exemplars were rewritten out of. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('fixes a bullet to one outcome', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = BULLET_SCOPE_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'A drafter reading "one bullet" as one edit splits a single outcome across bullets, and the split survives the ' +
      'whole pipeline: the audit may strike and correct but never merge, and the cutter may only delete. These ' +
      `phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('decides what a bullet names and how it marks it', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = NAMING_RULE_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The kinds list mis-predicts on its own: a flag is on it, and a flag this pipeline passes internally is one the ' +
      "reader never meets. Where these are gone, a bullet marks by kind and reports the change's own call rather " +
      `than what the reader gets. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it.each(SUBJECT_TEST_SOURCES)('states the subject test in %s', async (relativePath) => {
    const text = (await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT)).toLowerCase();
    const missing = SUBJECT_TEST_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The subject test decides a bullet without the doctrine. The drafter applies it and the caller audits the ' +
      'draft against it, and neither reads the other, so revising one leaves the other testing something else. ' +
      'Where it is gone, a bullet opens with a verb the pull request does not perform and the draft reads as ' +
      `correct, because every claim in it is true of the artifact the change added:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('names every rejection code the caller redispatches under', async () => {
    const text = await EXPANDED;
    const missing = REJECTION_CODES.filter((code) => !text.includes(`\`${code}\``));

    const message =
      'A redispatch hands the drafter a code and the passages that failed, so a code the caller sends and this ' +
      `file does not explain reaches a fresh context that cannot act on it. These codes are unexplained:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('binds a redispatch to the passages it is handed', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = REVISION_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'A redispatch hands the drafter the passages that failed and takes one replacement for each. A drafter told ' +
      'only that a draft failed redrafts every bullet in a context that never saw the last one, which is how a ' +
      `bullet that passed comes back changed. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('states the rule for leaving true facts out', async () => {
    const message =
      'The drafter carries no shared concision rule, so this section is the whole of what tells it to drop a fact. ' +
      'Deleting it leaves a drafter with no leave-out rule at all, and every suite stays green.';
    expect(await EXPANDED, message).toContain(LEAVE_OUT_RULE_PHRASE);
  });

  it('states what each type owes the reader', async () => {
    const text = await EXPANDED;
    const missing = TYPE_RULE_KEYS.filter((key) => !text.includes(`\`${key}\``));

    const message =
      'A type owing a fact beyond the assignment owes it here, and nothing else states these. Where one is gone, ' +
      'the drafter writes a bullet that reads as correct and withholds what that type is read for: a measured size, ' +
      `an exposure bound, a migration. These types are unstated:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('binds a migration paragraph to the edit, the trap, and the bound', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = MIGRATION_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'A migration paragraph is the whole channel to a consumer whose build broke, and the cutter never sees it. ' +
      'The trap the replacement carries appears in no hunk, so a caller auditing against the diff cannot supply it. ' +
      `These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('leaves out how the change was produced', async () => {
    const message =
      'A commit body carries review mechanics, ticket and finding numbers, and CI runs, and the drafter reads the ' +
      'commit log. Without this the drafter reads them as facts of the change and writes them into a bullet.';
    expect(await EXPANDED, message).toContain(PROCESS_NARRATION_PHRASE);
  });

  it('states that the title is already on the page', async () => {
    const message =
      "Every surface renders the change title above the lede, so a sentence restating it spends the reader's " +
      'opening seconds on what they already know, and a deletion-only cut cannot repair a bullet that opens by ' +
      'restating the title.';
    expect(await EXPANDED, message).toContain(TITLE_PHRASE);
  });

  it('prescribes no connective phrase', async () => {
    const message =
      `A form named in guidance is a form the model emits, so "${PRESCRIBED_CONNECTIVE}" reaches the draft wherever ` +
      'the drafter names it. A second outcome is a second bullet.';
    expect(await EXPANDED, message).not.toContain(PRESCRIBED_CONNECTIVE);
  });
});

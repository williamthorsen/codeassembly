import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// The drafter answers "What changed?" from the diff and the commit log, in a form that the author rates, and returns
// a lede and one entry per outcome. Two edits would defeat that quietly: taking the diff away, which leaves the
// inventory grounded in the diffstat alone, and loosening the granularity rule, whose entry unit is what keeps the
// diff from being catalogued edit by edit. The form is defeated by a prescribed phrase, which the model emits wherever
// guidance names one, by an exemplar below the floor, every one of which is paragraph-form, and by an entry unit that
// reads as one edit, whose split entries no later actor may merge. None of these failures shows up at runtime -- each
// yields a plausible entry list -- so the guard has to be here.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The drafter's assignment, which selects what it reports. */
const ASSIGNMENT_QUESTION = 'What changed?';

/** The heading under which the drafter returns its entries, which each caller parses as YAML. */
const ENTRIES_HEADING = '## Entries';

/** The fields that every entry declares, each of which some caller reads out of the returned YAML. */
const ENTRY_FIELDS: ReadonlyArray<string> = ['breaking', 'scopes', 'text', 'type'];

/** The exemplar call's quality floor, without which the corpus also returns the records beneath it. */
const EXEMPLAR_QUALITY_FLOOR = '--min-quality strong';

/**
 * Phrases stating the contract on an entry's `text`, which an edit restoring the paragraph form would lose.
 * Lowercased, so that a sentence's opening capital still matches.
 */
const FORM_CONTRACT_PHRASES: ReadonlyArray<string> = [
  'one sentence',
  'the artifact consumed by the reader',
  'third-person indicative present',
];

/**
 * Phrases fixing an entry's scope to the outcome rather than to the edit. When they are gone, "one entry" reads as one
 * edit, and the caller's audit may not merge the entries split by that reading. The drafter reads the whole diff, so
 * this rule is the only thing standing between it and an entry per hunk.
 */
const GRANULARITY_PHRASES: ReadonlyArray<string> = [
  'either two outcomes',
  'enumerates members whose count tracks the changed-file list',
  'not the edit that produced it',
  'one entry per outcome',
];

/** A `git diff` invocation that returns hunks: the bare form, or any form whose flags omit `--stat`. */
const HUNK_RETURNING_DIFF = /`git diff (?![^`]*--stat)[^`]*`/g;

/** The rule stating what an entry list leaves out, which the drafter's body contains in place of the shared concision rule. */
const LEAVE_OUT_RULE_PHRASE = 'the question is never whether a fact is real';

/**
 * Phrases fixing the lede to prose that summarizes the entries rather than restating them. Lowercased, so that a
 * sentence's opening capital still matches.
 */
const LEDE_FORM_PHRASES: ReadonlyArray<string> = [
  'include a fact stated by an entry only when',
  'a one-sentence lede is often complete',
  'prose, never a list',
];

/** The heading under which the drafter returns the lede, which each caller takes as `## What`. */
const LEDE_HEADING = '## Lede';

/** Phrases naming the reader that the lede is written for, who is not the reader of any one entry. */
const LEDE_READER_PHRASES: ReadonlyArray<string> = [
  'whoever meets the change without its entries',
  'the developer reading `git log`',
];

/**
 * Phrases deciding which entries declare a `migration` and which omit it. Lowercased, so that a sentence's opening
 * capital still matches.
 */
const MIGRATION_FIELD_PHRASES: ReadonlyArray<string> = [
  'declares a `migration`',
  'drops or deprecates published surface',
  'every other entry omits the key',
];

/**
 * Phrases binding an entry's `migration` to the edit, the trap, and the bound. The trap appears in no hunk, so a diff
 * review cannot recover it, and without the bound a migration grows a worked example per call shape.
 */
const MIGRATION_CONTRACT_PHRASES: ReadonlyArray<string> = [
  'any trap present in the replacement',
  'states the edit and the trap and stops there',
];

/**
 * Phrases deciding what an entry names and how it marks it. When they are gone, the kinds list reads as the
 * whole rule, so a token that the reader never sees is backticked, and the internal call stands in for what the
 * artifact does.
 */
const NAMING_RULE_PHRASES: ReadonlyArray<string> = [
  'never the internal call that the change edited',
  'what the reader consumes decides the marking',
];

/** The phrase binding the exemplar call to each entry's own type rather than to the branch's one dispatched type. */
const PER_TYPE_EXEMPLAR_PHRASE = 'once per distinct type among your entries';

/** A connective prescribed nowhere by the drafter, pinned as a literal because a rewording is how it returns. */
const PRESCRIBED_CONNECTIVE = 'Separately,';

/** The phrase excluding how a change was produced, which a commit body contains and a bullet does not. */
const PROCESS_NARRATION_PHRASE = 'review mechanics, ticket and finding numbers';

/** Every code under which the caller redispatches, each of which the drafter has to be able to act on. */
const REJECTION_CODES: ReadonlyArray<string> = ['subject', 'unmatched-return', 'unsupported-claim', 'voice'];

/**
 * Phrases naming each reader, which a rewrite dropping the audience would lose. Lowercased, so that a doctrine
 * bullet's opening capital still matches.
 */
const READER_PHRASES: ReadonlyArray<string> = ['uses the package and does not work on it', 'works in this codebase'];

/**
 * Phrases binding a redispatch to the passages that it was handed. Lowercased, so that a sentence's opening capital
 * still matches.
 */
const REVISION_CONTRACT_PHRASES: ReadonlyArray<string> = [
  '`rejected` fence',
  'a redispatch returns no `## lede` section',
  'one replacement per passage',
  'revise those passages and nothing else',
];

/** The rule directing the writer to state the change, whether or not a title above the lede names it too. */
const STANDALONE_PHRASE = 'The lede stands alone';

/**
 * Phrases stating the subject test, which decides a bullet's subject without the doctrine. Lowercased, so that a
 * sentence's opening capital still matches.
 */
const SUBJECT_TEST_PHRASES: ReadonlyArray<string> = [
  '"this pull request" in front of it',
  'the verb names what the system does rather than what the change did',
];

/** Each file stating the subject test: The drafter applies it, and the caller audits the draft against it. */
const SUBJECT_TEST_SOURCES: ReadonlyArray<string> = [
  path.join('skills', 'summarize-change', 'SKILL.md'),
  path.join('subagents', 'entry-drafter.md'),
];

/**
 * Phrases keeping a supporting edit out of the entry list and out of scope resolution. Lowercased, so that a
 * sentence's opening capital still matches.
 */
const SUPPORTING_EDIT_PHRASES: ReadonlyArray<string> = [
  'a supporting edit is no outcome of its own',
  'the paths in which its outcome appears',
];

/** The taxonomy that supplies each entry's `type`, and through that type's tier its reader. */
const TAXONOMY_FILENAME = 'work-types.json';

/** The flag to which the exemplar call falls back when an outcome resolves to no type in the taxonomy. */
const TIER_FALLBACK_FLAG = '--tier {tier}';

/**
 * Work types whose entry owes a fact that the assignment does not supply. Each is stated nowhere else, so a rewrite
 * that drops one leaves the drafter with no guidance at all on that type and every suite green.
 */
const TYPE_RULE_KEYS: ReadonlyArray<string> = ['ai', 'deps', 'deprecate', 'drop', 'fix', 'perf', 'refactor', 'sec'];

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'subagents', 'entry-drafter.md'), CONTENT_ROOT);

describe('entry-drafter contract', () => {
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
      `writer. When one is gone, the drafter writes for an audience that nothing named. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('sends the drafter to a command returning diff hunks', async () => {
    const found = (await EXPANDED)
      .matchAll(HUNK_RETURNING_DIFF)
      .map((match) => match[0])
      .toArray();

    const message =
      'The drafter reports what changed, so it reads the hunks. The entry list is meant to be complete at outcome ' +
      'granularity, and the lede states what those outcomes amount to. A drafter left with the diffstat alone ' +
      'reports what the commit subjects already say. No invocation here returns hunks.';
    expect(found.length, message).toBeGreaterThan(0);
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
      `A dispatch naming \`tier\` and no \`type\` is one that \`summarize-change\` produces, so the fallback runs. ` +
      `A line naming \`${TIER_FALLBACK_FLAG}\` without the floor reads as the whole argument list, which returns the ` +
      `records excluded by the floor. These lines drop it:\n  ${found.join('\n  ')}`;
    expect(found, message).toEqual([]);
  });

  it('states the contract on an entry’s text', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = FORM_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The drafter is the only file that binds the writer, so a drafter that states no form contract drafts the ' +
      `paragraph out of which the exemplars were rewritten. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('fixes an entry to one outcome', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = GRANULARITY_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'A drafter reading "one entry" as one edit splits a single outcome across entries, and the split survives the ' +
      'whole pipeline, since the audit may strike and correct but never merge. The drafter reads the whole diff, so ' +
      'this rule is also what stops the entry list becoming an inventory of hunks. These ' +
      `phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('keeps a supporting edit out of the entries and their scopes', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = SUPPORTING_EDIT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'An edit that only supports an outcome, such as a catalog move in another workspace, otherwise becomes an ' +
      'entry or a path of its own, and its workspace then strips the branch of the scope that its commits declare. ' +
      `These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('decides what an entry names and how it marks it', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = NAMING_RULE_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The kinds list mis-predicts on its own: A flag is on it, and a flag that this pipeline passes internally is ' +
      "one that the reader never sees. When these are gone, an entry marks by kind and reports the change's own " +
      `call rather than what the reader gets. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it.each(SUBJECT_TEST_SOURCES)('states the subject test in %s', async (relativePath) => {
    const text = (await expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT)).toLowerCase();
    const missing = SUBJECT_TEST_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The subject test decides a bullet without the doctrine. The drafter applies it and the caller audits the ' +
      'draft against it, and neither reads the other, so revising one leaves the other testing something else. ' +
      'When it is gone, a bullet opens with a verb that the pull request does not perform and the draft reads as ' +
      `correct, because every claim in it is true of the artifact added by the change:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('names every rejection code the caller redispatches under', async () => {
    const text = await EXPANDED;
    const missing = REJECTION_CODES.filter((code) => !text.includes(`\`${code}\``));

    const message =
      'A redispatch hands the drafter a code and the passages that failed, so a code that the caller sends and this ' +
      `file does not explain reaches a fresh context that cannot act on it. These codes are unexplained:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('binds a redispatch to the passages that it is handed', async () => {
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
      'The drafter’s body contains no shared concision rule, so this section is the whole of what tells it to drop a fact. ' +
      'Deleting it leaves a drafter with no leave-out rule at all, and every suite stays green.';
    expect(await EXPANDED, message).toContain(LEAVE_OUT_RULE_PHRASE);
  });

  it('states what each type owes the reader', async () => {
    const text = await EXPANDED;
    const missing = TYPE_RULE_KEYS.filter((key) => !text.includes(`\`${key}\``));

    const message =
      'A type owing a fact beyond the assignment owes it here, and nothing else states these. When one is gone, ' +
      'the drafter writes a bullet that reads as correct and withholds what that type is read for: a measured size, ' +
      `an exposure bound, a migration. These types are unstated:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('binds an entry’s migration to the edit, the trap, and the bound', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = MIGRATION_CONTRACT_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'An entry’s `migration` is the only text addressed to a consumer whose build broke, and the merge commit ' +
      'records it whatever else is cut. The trap present in the replacement appears in no hunk, so a caller ' +
      `auditing against the diff cannot supply it. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('decides which entries declare a migration', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = MIGRATION_FIELD_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'An entry’s `migration` is the upgrade instruction that release notes render under its bullet, and this file ' +
      'is the only one that tells the drafter when to write it. Without the trigger, a breaking entry reaches the ' +
      `changelog with no instruction; without the omission, every entry grows one. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('leaves out how the change was produced', async () => {
    const message =
      'A commit body contains review mechanics, ticket and finding numbers, and CI runs, and the drafter reads the ' +
      'commit log. Without this the drafter reads them as facts of the change and writes them into a bullet.';
    expect(await EXPANDED, message).toContain(PROCESS_NARRATION_PHRASE);
  });

  it('states that the lede stands alone', async () => {
    const message =
      '`## What` is the text that the merge commit, the changelog, and the release notes contain, so a lede leaving ' +
      'the statement of the change to a title reads as details under a heading. Without this the drafter writes ' +
      'around the title again, and every sentence that it writes is true.';
    expect(await EXPANDED, message).toContain(STANDALONE_PHRASE);
  });

  it('returns the lede above the entries', async () => {
    const text = await EXPANDED;
    const ledeAt = text.indexOf(LEDE_HEADING);
    const entriesAt = text.indexOf(ENTRIES_HEADING);

    const message =
      'The caller takes `## What` from this section and parses the entries from the next, matching each heading in ' +
      `the return. A return missing \`${LEDE_HEADING}\`, or placing it below \`${ENTRIES_HEADING}\`, leaves the ` +
      'caller with no lede to take and a thin body that the merge flow then recomposes from the diff.';
    expect(ledeAt, message).toBeGreaterThan(-1);
    expect(entriesAt, message).toBeGreaterThan(ledeAt);
  });

  it('fixes the lede to prose that summarizes the entries', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = LEDE_FORM_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The lede is the whole of what a reader of `git log` gets, and nothing downstream shortens it or changes its ' +
      'shape. The same reader reads the entries next, so a lede that restates them costs a second pass over the ' +
      'same facts. Without the summary rule it gives each entry a sentence, without the one-sentence allowance it ' +
      'fills a length as a budget, and without the prose rule it arrives as the entry list a second time. These ' +
      `phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('names the lede’s own reader', async () => {
    const text = (await EXPANDED).toLowerCase();
    const missing = LEDE_READER_PHRASES.filter((phrase) => !text.includes(phrase));

    const message =
      'The entries are written for the reader that each type’s tier names, and the lede for whoever meets the ' +
      'change without them. When that reader is gone, the lede is written for the entry list’s audience and ' +
      `addresses someone who is already reading the entries. These phrases are gone:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('prescribes no connective phrase', async () => {
    const message =
      `A form named in guidance is a form that the model emits, so "${PRESCRIBED_CONNECTIVE}" reaches the draft ` +
      'wherever the drafter names it. A second outcome is a second bullet.';
    expect(await EXPANDED, message).not.toContain(PRESCRIBED_CONNECTIVE);
  });

  it('names every field that an entry declares', async () => {
    const text = await EXPANDED;
    const missing = ENTRY_FIELDS.filter((field) => !text.includes(`\`${field}\``));

    const message =
      'Both callers parse the returned YAML by these names, and neither reads the other. A field that this file ' +
      'stops naming is one that the drafter stops emitting, which leaves the caller rendering a subsection, a ' +
      `breaking prefix, or a scope tag from nothing:\n  ${missing.join('\n  ')}`;
    expect(missing, message).toEqual([]);
  });

  it('reads the taxonomy for each entry’s type', async () => {
    const message =
      `Each entry's \`type\` is a key in \`${TAXONOMY_FILENAME}\`, and that type's tier names the entry's reader. ` +
      'A drafter that reads no taxonomy invents type names, and the caller then has no subsection to render the ' +
      'entry under.';
    expect(await EXPANDED, message).toContain(TAXONOMY_FILENAME);
  });

  it('draws exemplars once per type among the entries', async () => {
    const message =
      '`## Details` contains a bullet under every type the branch touches, so one call for the branch calibrates ' +
      'every entry against the highest-ranking type and miscalibrates all but one of them. Each type was rated by ' +
      'the author for its own reader.';
    expect(await EXPANDED, message).toContain(PER_TYPE_EXEMPLAR_PHRASE);
  });
});

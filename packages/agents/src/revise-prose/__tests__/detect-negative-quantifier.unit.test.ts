import { describe, expect, it } from 'vitest';

import { detectNegativeQuantifiers } from '../detect-negative-quantifier.ts';
import { maskCodeSpans } from '../mask-code-spans.ts';
import type { NegativeQuantifierCandidate } from '../types.ts';

/**
 * Sites of the construction in this library's own guidance, each paired with the wording that replaced it. The "before"
 * column is the recall floor and the "after" column the precision floor.
 */
const REPAIRED_SITES: ReadonlyArray<{ head: string; before: string; after: string }> = [
  {
    head: 'drawback',
    before: 'Adding a skill that declares a guidance hook has a drawback that no current member has.',
    after: 'Adding a skill that declares a guidance hook has a drawback that the current members do not have.',
  },
  {
    head: 'tool',
    before: 'Use inheritance when the subagent needs a tool that no allowlist can name.',
    after: 'Use inheritance when the subagent needs a tool that an allowlist cannot name.',
  },
  {
    head: 'field',
    before: "The overrides apply one field at a time, and a field that no override names keeps the record's value.",
    after: "The overrides apply one field at a time, and a field without an override keeps the record's value.",
  },
  {
    head: 'path',
    before: 'A path that no scope directory contains resolves to the root.',
    after: 'A path outside every scope directory resolves to the root.',
  },
  {
    head: 'skill',
    before: 'When an ordering constraint names a skill that no task invokes, add the task.',
    after: "When an ordering constraint names a skill that the plan's tasks do not invoke, add the task.",
  },
  {
    head: 'behavior',
    before: 'The user wants a behavior that no current guidance covers.',
    after: 'The user wants a behavior that the current guidance does not cover.',
  },
  {
    head: 'boundaries',
    before: 'The relay fires at boundaries that no skill is running to observe.',
    after: "The relay fires at boundaries outside any skill's run, so a skill cannot observe them.",
  },
  {
    head: 'notes',
    before: 'A folder containing notes that no domain declares is drift.',
    after: 'A folder containing notes outside every declared domain is drift.',
  },
  {
    head: 'reason',
    before: 'Name the checkout there as the reason that no block can be drafted here.',
    after: 'Name the checkout there as the reason for not drafting a block here.',
  },
  {
    head: 'reason',
    before: 'It is the reason no artifact has to be examined before the vetted collections become usable.',
    after: 'It is why the vetted collections are usable before the vetting examines a single artifact.',
  },
];

/** Sites written by agents and recorded in the knowledge base, which prompted the rule. */
const RECORDED_SITES: ReadonlyArray<{ head: string; sentence: string }> = [
  { head: 'rule', sentence: 'The sweep skips a rule that no catalogue names.' },
  { head: 'body', sentence: 'It edits an issue body that no lede audit reaches.' },
  { head: 'condition', sentence: 'The guard handles a condition that no user could observe.' },
  { head: 'case', sentence: 'The test covers the case no tester can produce.' },
];

describe(detectNegativeQuantifiers, () => {
  describe('recall', () => {
    it.each(REPAIRED_SITES)('reports the library site headed by "$head" as relative', ({ before }) => {
      expect(detect(before)).toEqual([expect.objectContaining({ positions: ['relative'] })]);
    });

    it.each(RECORDED_SITES)('reports the recorded site headed by "$head" as relative', ({ sentence }) => {
      expect(detect(sentence)).toEqual([expect.objectContaining({ positions: ['relative'] })]);
    });

    it('reports a relative site whose relativizer follows a comma', () => {
      expect(detect('It resolves to a location, which no rewritten path could name.')).toEqual([
        expect.objectContaining({ positions: ['relative'] }),
      ]);
    });

    it.each(['a rule that no other file declares', 'a field that no such override names'])(
      'reports "no other" and "no such" in "%s" as relative',
      (sentence) => {
        expect(detect(sentence)).toEqual([expect.objectContaining({ positions: ['relative'] })]);
      },
    );

    it.each([
      "There's no Vercel CLI.",
      'There is no test for it.',
      'Once the sweep ends, there will be no entry.',
      'There’s no record.',
    ])('reports the existential site in "%s"', (sentence) => {
      expect(detect(sentence)).toEqual([expect.objectContaining({ positions: ['existential'] })]);
    });

    it.each([
      'The merge publishes no build output.',
      'A change naming no scope keeps its type prefix.',
      'The pre-flight checker found no known issues.',
      'The prompt explains that no run-index file exists.',
      'No file is written.',
      'The review ended with no findings.',
      'It masks the link so that no URL reaches the detector.',
      'When no consumer could observe it, the change repairs nothing.',
      'The sweep reads no more files.',
      'Nothing follows: no rule applies.',
    ])('reports the site in "%s" as other', (sentence) => {
      expect(detect(sentence)).toEqual([expect.objectContaining({ positions: ['other'] })]);
    });
  });

  describe('precision', () => {
    it.each(REPAIRED_SITES)('reports nothing in the repair of the site headed by "$head"', ({ after }) => {
      expect(detect(after)).toEqual([]);
    });

    it.each([
      'a file that no longer exists',
      'It fails, no matter which path it takes.',
      'No sooner had it started than it stopped.',
      'The cache is stale, no doubt.',
      'It reads no more than ten files.',
      'It reads no less than ten files.',
      'It reads no fewer than ten files.',
    ])('skips the fixed phrase in "%s"', (sentence) => {
      expect(detect(sentence)).toEqual([]);
    });

    it('skips the pronoun "no one"', () => {
      expect(detect('a task that no one invokes')).toEqual([]);
    });

    it('skips a hyphenated compound', () => {
      expect(detect('The hook is a no-op here.')).toEqual([]);
    });

    it.each(['No, the file stays.', 'The answer is no.', 'Say no to it.'])(
      'skips a `no` that does not open a noun phrase in "%s"',
      (sentence) => {
        expect(detect(sentence)).toEqual([]);
      },
    );

    it('skips a `no` inside an inline code span', () => {
      expect(detectMasked('A field that `no override` names keeps its value.')).toEqual([]);
    });
  });

  describe('the candidate', () => {
    it('reports the sentence as the phrase, with the position of its `no`', () => {
      expect(detect('It edits an issue body that no lede audit reaches.')).toEqual([
        {
          rule: 'negative-quantifier',
          file: 'fixture.md',
          line: 1,
          phrase: 'It edits an issue body that no lede audit reaches.',
          sentence: 'It edits an issue body that no lede audit reaches.',
          positions: ['relative'],
        } satisfies NegativeQuantifierCandidate,
      ]);
    });

    it('reports two `no`s in one sentence as one candidate with both positions in reading order', () => {
      expect(detect('There is no test for a field that no fixture names.')).toEqual([
        expect.objectContaining({ positions: ['existential', 'relative'] }),
      ]);
    });

    it('reports each sentence of a span separately', () => {
      expect(detect('It publishes no build output. It declares no entry point.')).toEqual([
        expect.objectContaining({ sentence: 'It publishes no build output.' }),
        expect.objectContaining({ sentence: 'It declares no entry point.' }),
      ]);
    });

    it("reports the line on which the sentence begins, not the `no`'s line", () => {
      const candidates = detectNegativeQuantifiers([
        { file: 'docs/guide.md', line: 40, text: 'The first line.\nThen a skill that\nno task invokes.' },
      ]);

      expect(candidates).toEqual([expect.objectContaining({ file: 'docs/guide.md', line: 41 })]);
    });
  });
});

// region | Helpers

/** Detects over one sentence held in a single span. */
function detect(sentence: string): NegativeQuantifierCandidate[] {
  return detectNegativeQuantifiers([{ file: 'fixture.md', line: 1, text: sentence }]);
}

/** Detects over one sentence masked as the extractor masks it, which is the form that the detector reads in a sweep. */
function detectMasked(sentence: string): NegativeQuantifierCandidate[] {
  return detect(maskCodeSpans(sentence));
}

// endregion | Helpers

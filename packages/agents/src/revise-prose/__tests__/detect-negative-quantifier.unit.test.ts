import { describe, expect, it } from 'vitest';

import { detectNegativeQuantifiers } from '../detect-negative-quantifier.ts';
import { CODE_SPAN_PLACEHOLDER, maskCodeSpans } from '../mask-code-spans.ts';
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
    it.each(REPAIRED_SITES)('reports the library site headed by "$head"', ({ head, before }) => {
      expect(detect(before)).toEqual([expect.objectContaining({ head })]);
    });

    it.each(RECORDED_SITES)('reports the recorded site headed by "$head"', ({ head, sentence }) => {
      expect(detect(sentence)).toEqual([expect.objectContaining({ head })]);
    });

    it('reports a site whose relativizer follows a comma', () => {
      expect(detect('It resolves to a location, which no rewritten path could name.')).toEqual([
        expect.objectContaining({ head: 'location', subject: 'rewritten path', verb: 'could' }),
      ]);
    });
  });

  describe('precision', () => {
    it.each(REPAIRED_SITES)('reports nothing in the repair of the site headed by "$head"', ({ after }) => {
      expect(detect(after)).toEqual([]);
    });

    it.each([
      'a file that no longer exists',
      'a rule that no more files declare',
      'a task that no one invokes',
      'a rule that no other file declares',
      'a field that no such override names',
    ])('skips the fixed phrase in "%s"', (sentence) => {
      expect(detect(sentence)).toEqual([]);
    });

    // Each `no` phrase is the object of the verb or participle before it, not the subject of a relative clause.
    it.each([
      'The merge publishes no change entries.',
      'A change naming no scope keeps its type prefix.',
      'The pre-flight checker found no known issues.',
      'The prompt explains that no run-index file exists.',
      'An empty list means no open pull request exists.',
    ])('skips the object phrase in "%s"', (sentence) => {
      expect(detect(sentence)).toEqual([]);
    });

    it('skips a `no` phrase after the "so that" of a purpose clause', () => {
      expect(detect('It masks the link so that no URL reaches the detector.')).toEqual([]);
    });

    it('skips a `no` phrase that opens a clause without a head', () => {
      expect(detect('When no consumer could observe it, the change repairs nothing.')).toEqual([]);
    });

    it('skips a `no` inside an inline code span', () => {
      expect(detectMasked('A field that `no override` names keeps its value.')).toEqual([]);
    });
  });

  describe('the candidate', () => {
    it('reports the head, the phrase after `no`, the verb, and the phrase from head to verb', () => {
      expect(detect('It edits an issue body that no lede audit reaches.')).toEqual([
        {
          rule: 'negative-quantifier',
          file: 'fixture.md',
          line: 1,
          head: 'body',
          subject: 'lede audit',
          verb: 'reaches',
          phrase: 'body that no lede audit reaches',
          sentence: 'It edits an issue body that no lede audit reaches.',
        } satisfies NegativeQuantifierCandidate,
      ]);
    });

    it('reports an inline code span in the subject as the placeholder', () => {
      expect(detectMasked('It deploys a skill that no `skills/` directory contains.')).toEqual([
        expect.objectContaining({ head: 'skill', subject: `${CODE_SPAN_PLACEHOLDER} directory`, verb: 'contains' }),
      ]);
    });

    it('reports the line on which the head stands', () => {
      const candidates = detectNegativeQuantifiers([
        { file: 'docs/guide.md', line: 40, text: 'The first line.\nThen a skill that no task invokes.' },
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

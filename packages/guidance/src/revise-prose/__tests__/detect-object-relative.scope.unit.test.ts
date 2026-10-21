import { describe, expect, it } from 'vitest';

import { detectObjectRelatives } from '../detect-object-relative.ts';
import { CODE_SPAN_PLACEHOLDER, maskCodeSpans } from '../mask-code-spans.ts';
import { detect } from '../test-utils/detect-sentence.ts';
import type { ObjectRelativeCandidate } from '../types.ts';

/** Neighbouring constructions that the rulebook puts outside the rule, decidable from the head noun alone. */
const OUT_OF_SCOPE_HEADS: ReadonlyArray<string> = [
  'The reason it fails is that the cache is cold.',
  'The way it works is documented on the helper.',
  'Everything I know about the parser is in that module.',
  'All you need is the branch name.',
];

describe(detectObjectRelatives, () => {
  describe('adverbs between the subject and the verb', () => {
    it.each([
      { sentence: 'Audits every workspace bin against the source it also names.', verb: 'names' },
      { sentence: 'Audits every workspace bin against the source it quietly names.', verb: 'names' },
    ])('reads through one to the verb: $verb', ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'source', verb });
    });
  });

  describe('a preposition inside the subject', () => {
    it('reaches the verb past a prepositional phrase', () => {
      const candidates = detect("The sweep covers the sources this package's own prose about the idioms lives in.");

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'sources', verb: 'lives' });
    });

    it.each([
      'The sweep covers the sources this prose about the idioms lists.',
      'The sweep covers the sources this prose about the idioms lists in the appendix.',
    ])('passes over a verb that does not strand a clause-final preposition: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('applies the same gate to a verb that an auxiliary carries', () => {
      const stranded = detect('The sweep covers the sources this prose about the idioms has drawn on.');

      expect(stranded).toHaveLength(1);
      expect(stranded[0]).toMatchObject({ head: 'sources', verb: 'drawn' });
      expect(detect('The sweep covers the sources this prose about the idioms has listed.')).toStrictEqual([]);
    });

    it('applies the same gate to a main-verb auxiliary', () => {
      expect(detect('The sweep covers the sources this prose about the idioms has.')).toStrictEqual([]);
    });

    it('gives a partitive `of` neither the wider window nor the stranded-preposition gate of a prepositional phrase', () => {
      const candidates = detect('The wrapping two of them apply is identical.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'wrapping', verb: 'apply' });
    });
  });

  describe('non-head modifiers', () => {
    it.each([
      'The same rules apply to test files as to source.',
      'All other files receive three comment lines.',
      "Only the root's own artifacts are reported on.",
      "A single artifact's normalized listing fields are attached.",
    ])('passes over a modifier standing where a head noun would: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('still reads a head noun that a modifier precedes', () => {
      const candidates = detect('Reports the same source it names.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'source', phrase: 'source it names' });
    });
  });

  describe('pro-form heads', () => {
    it.each([
      'The failure is not one the spy carries.',
      'The failure is not one it declares.',
      'The report names the one the runner renders.',
    ])('reads the anaphoric `one` as a head: %s', (sentence) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'one' });
    });

    it('reads the plural of the series the same way', () => {
      const candidates = detect('The report lists the ones the runner renders.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'ones', phrase: 'ones the runner renders' });
    });

    it.each(['No one it names survives the sweep.', 'Every one it names survives the sweep.'])(
      'passes over a quantifier fused with the series: %s',
      (sentence) => {
        expect(detect(sentence)).toStrictEqual([]);
      },
    );

    it('keeps a partitive, which a relativizer restores to', () => {
      expect(detect('Another one it names survives the sweep.')).toHaveLength(1);
    });
  });

  describe('agentive participles', () => {
    it.each([
      'Reads the direct dependency names declared by the project.',
      'Counts the working-tree changes reported by the status command.',
      'Address any assumption issues flagged by the architect.',
    ])("passes over the rule's own passive-participle repair: %s", (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('keeps a site whose `by` does work other than naming an agent', () => {
      const candidates = detect('The two clauses the author struck by name were probed.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'clauses the author struck' });
    });

    it('keeps a passive clause, whose participle an auxiliary carries', () => {
      const candidates = detect('Reports the level it is probed against by the harness.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'level it is probed' });
    });
  });

  describe('scope', () => {
    it.each(OUT_OF_SCOPE_HEADS)('passes over %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('passes over a relativizer already in place', () => {
      expect(detect('The ticket that the branch name encodes is the value it reports.')).toHaveLength(1);
    });

    it('passes over a main clause, whose determiner does not reach a noun before the verb', () => {
      expect(detect('An unset shell variable expands to the empty string.')).toStrictEqual([]);
    });

    it('passes over a subject that runs past the window', () => {
      expect(detect('The ticket a long and rather overqualified branch name encodes is unresolved.')).toStrictEqual([]);
    });

    it('passes over a participial phrase, whose participle lacks a determiner to turn it into a head noun', () => {
      expect(detect('A package holding one drops it silently.')).toStrictEqual([]);
    });

    it('reads a specified gerund as a head noun, since a specifier makes it one', () => {
      expect(detect('The wrapping two of them apply is identical.')).toHaveLength(1);
      expect(detect('Every wrapping two of them apply is identical.')).toHaveLength(1);
    });

    it('reads a quantified bare-noun subject, whose head a quantifier specifies', () => {
      expect(detect('The library ships every idiom developers recognize.')).toHaveLength(1);
    });
  });

  describe('competing anchors', () => {
    it.each([
      {
        sentence: 'The next sync overwrites it, so the edit belongs to the source it was copied from.',
        head: 'source',
      },
      {
        sentence: 'Each pass renders its content for the harness it lands on.',
        head: 'harness',
      },
    ])('keeps the tightest head closing on a verb: $head', ({ sentence, head }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head });
    });

    it.each([
      { sentence: 'The report drops the entries the sweep no longer holds.', head: 'entries', verb: 'holds' },
      { sentence: 'Compare it against the body the user most recently approved.', head: 'body', verb: 'approved' },
    ])('passes over an adverbial that would otherwise be kept for being nearest: $head', ({ sentence, head, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head, verb });
    });

    it.each([
      'The suite lists the reports many early readers cited.',
      'The suite lists the reports two likely readers cited.',
      'The suite lists the reports two longer digests cited.',
      'The suite lists the reports many later drafts cited.',
      'The suite lists the reports no early readers cited.',
    ])('keeps a quantified subject whose second word is an adjective: %s', (sentence) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'reports' });
    });

    it("reads a pro-form after a comparative as its phrase's head, not as a subject", () => {
      const candidates = detect('A later tool can read a key an older one ignores.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'key', subject: 'an older one', verb: 'ignores' });
    });

    it('keeps a pro-form subject not preceded by a comparative', () => {
      const candidates = detect('The report names the source one names.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'source', subject: 'one', verb: 'names' });
    });

    it('keeps the nearest reading when a quantified subject opens a real noun phrase', () => {
      const candidates = detect('Then retract the namespaces no source claims.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'namespaces', subject: 'no source', shape: 'quantified' });
    });

    it("reads an object pronoun as neither the verb nor a stranded preposition's gap", () => {
      const candidates = detect("Joins one kind's problems into the clause its error message reports them in.");

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'clause', verb: 'reports' });
    });

    it('keeps a filled preposition unstranded when an object pronoun fills it', () => {
      expect(detect('The store the entries belong to them is closed.')).toStrictEqual([]);
    });
  });

  describe('inline code', () => {
    it('does not report a head noun drawn from a code span', () => {
      expect(detectMasked('Supplies the `_defaults` the subagent frontmatter merge applies.')).toStrictEqual([]);
    });

    it('does not report a verb drawn from a code span', () => {
      expect(detectMasked('The directive uses `include` for that.')).toStrictEqual([]);
    });

    it('does not report an embedded subject drawn from a code span', () => {
      expect(detectMasked("A note's `tags` include the store.")).toStrictEqual([]);
    });

    it('leaves a site lying wholly inside a code span alone', () => {
      expect(detectMasked('The rulebook rejects `the source it names` as an exhibit.')).toStrictEqual([]);
    });

    it('still reports a site that a code span interrupts, with the placeholder standing in the span', () => {
      const candidates = detectMasked('Audits the kit the `codeassembly` package publishes.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        head: 'kit',
        subject: `the ${CODE_SPAN_PLACEHOLDER} package`,
        verb: 'publishes',
        phrase: `kit the ${CODE_SPAN_PLACEHOLDER} package publishes`,
      });
    });

    it("keeps the placeholder's delimiters in the subject, which a bare token would lose", () => {
      const candidates = detectMasked("Names the source the user's `codeassembly.yaml` declares.");

      expect(candidates[0]?.subject).toBe(`the user's ${CODE_SPAN_PLACEHOLDER}`);
    });
  });

  describe('location', () => {
    it('reports the line on which the site appears within a wrapped block', () => {
      const candidates = detectObjectRelatives([
        { file: 'docs/guide.md', line: 40, text: 'A clean first line.\nThen the source it names.' },
      ]);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ file: 'docs/guide.md', line: 41, sentence: 'Then the source it names.' });
    });
  });
});

// region | Helpers

/** Detects over one sentence masked as the extractor masks it, which is the form that the detector reads in a sweep. */
function detectMasked(sentence: string): ObjectRelativeCandidate[] {
  return detect(maskCodeSpans(sentence));
}

// endregion | Helpers

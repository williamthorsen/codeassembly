import { describe, expect, it } from 'vitest';

import { detectCandidates } from '../detect.ts';
import type { Candidate, SubjectShape } from '../types.ts';

/**
 * The sites williamthorsen/toolbelt@5dd0ad2 repaired, each paired with the wording that replaced it. The commit is the
 * worked before-and-after for this rule, so its "before" column is the recall floor the detector is tuned against and
 * its "after" column is the precision floor.
 */
const REPAIRED_SITES: ReadonlyArray<{ shape: SubjectShape; before: string; after: string }> = [
  {
    shape: 'quantified',
    before: 'An entry point nothing imports is what support-module-usage reports.',
    after: 'An entry point that nothing imports is what support-module-usage reports.',
  },
  {
    shape: 'definite',
    before: 'A dependency only a bin imports would fail dependency-reachability.',
    after: 'A dependency imported only by a bin would fail dependency-reachability.',
  },
  {
    shape: 'definite',
    before: 'A bound, offset, or key the library rejects exits 2 carrying the message the library raises.',
    after: 'A bound, offset, or key rejected by the library exits 2 carrying the message it raises.',
  },
  {
    shape: 'pronoun',
    before: 'Audits every workspace bin against the source it names.',
    after: 'Audits every workspace bin against the source that it names.',
  },
  {
    shape: 'pronoun',
    before: 'Reports what disqualifies a bin target, or undefined where the source it names is fit to run.',
    after: 'Reports what disqualifies a bin target, or undefined where the source that it names is fit to run.',
  },
  {
    shape: 'definite',
    before: 'Finds the ticket a branch name encodes, or undefined when it encodes none.',
    after: 'Finds the ticket encoded by a branch name, or undefined when it encodes none.',
  },
  {
    shape: 'definite',
    before: 'Derives the number of the ticket the name encodes, or a hash of the name when it encodes none.',
    after: 'Derives the number of the ticket encoded by the name, or a hash of the name when it encodes none.',
  },
  {
    shape: 'definite',
    before: 'Finds the ticket ref a branch name encodes, or undefined when it encodes none.',
    after: 'Finds the ticket ref encoded by a branch name, or undefined when it encodes none.',
  },
  {
    shape: 'definite',
    before: 'Reports the version this package declares, not an ancestor manifest.',
    after: 'Reports the version declared by this package, not an ancestor manifest.',
  },
  {
    shape: 'definite',
    before: 'Prints the number the branch encodes.',
    after: 'Prints the number encoded by the branch.',
  },
  {
    shape: 'definite',
    before: 'Print the ID of the ticket a branch name encodes, exiting 1 when it encodes none.',
    after: 'Print the ID of the ticket encoded by a branch name, exiting 1 when it encodes none.',
  },
  {
    shape: 'definite',
    before: 'The effects the runner defers to its entry point, which is what keeps the runner free of IO.',
    after: 'The effects deferred to the entry point, which is what keeps the runner free of IO.',
  },
  {
    shape: 'definite',
    before: 'Extracts the message an unknown thrown value carries.',
    after: 'Extracts the message carried by an unknown thrown value.',
  },
  {
    shape: 'pronoun',
    before: 'Parses the ticket-ref subcommand and prints the ref it finds, or reports that it found none.',
    after: 'Parses the ticket-ref subcommand and prints the ref that it finds, or reports that it found none.',
  },
  {
    shape: 'definite',
    before: 'Reports a printed result, terminating the line the caller writes.',
    after: 'Reports a printed result, terminating the line written by the caller.',
  },
];

/** The one replacement wording that still carries the construction, at a second site on the same line. */
const SURVIVING_SITE = 'A bound, offset, or key rejected by the library exits 2 carrying the message it raises.';

/** Neighbouring constructions the rulebook puts outside the rule, decidable from the head noun alone. */
const OUT_OF_SCOPE_HEADS: ReadonlyArray<string> = [
  'The reason it fails is that the cache is cold.',
  'The way it works is documented on the helper.',
  'Everything I know about the parser is in that module.',
  'All you need is the branch name.',
];

describe(detectCandidates, () => {
  describe('the worked before-and-after', () => {
    it.each(REPAIRED_SITES)('reports $before', ({ before, shape }) => {
      const candidates = detect(before);

      expect(candidates[0]?.shape).toBe(shape);
      expect(candidates[0]?.sentence).toBe(before);
    });

    it.each(REPAIRED_SITES.filter(({ after }) => after !== SURVIVING_SITE))('passes over $after', ({ after }) => {
      expect(detect(after)).toStrictEqual([]);
    });

    it('reports the site the commit left behind on a line it otherwise repaired', () => {
      const candidates = detect(SURVIVING_SITE);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ shape: 'pronoun', head: 'message', subject: 'it', verb: 'raises' });
    });
  });

  describe('shapes', () => {
    it('reads a numeral-led subject as the quantified shape the rulebook ranks worst', () => {
      const candidates = detect('The rules decide which kit claims an idiom two of them recognize.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({
        shape: 'quantified',
        head: 'idiom',
        subject: 'two of them',
        verb: 'recognize',
      });
    });

    it.each([
      'Reports the warning the parser emitted.',
      'Reports every warning the parser emitted.',
      'Reports each setting the config overrides.',
      'Reports two warnings the parser emitted.',
    ])('licenses a head carrying verbal morphology under any specifier: %s', (sentence) => {
      expect(detect(sentence)).toHaveLength(1);
    });

    it.each(['Reports the file the parser may read.', 'Reports the file the parser will not read.'])(
      'reads through a modal to the verb it carries: %s',
      (sentence) => {
        expect(detect(sentence)).toHaveLength(1);
      },
    );

    it('passes over a modal carrying no lexical verb', () => {
      expect(detect('Reports whether the file the parser should be.')).toStrictEqual([]);
    });

    it('holds a plural specifier to a plural head, so a numeral beside a participle licenses nothing', () => {
      const candidates = detect('The key exits 2 carrying the message it raises.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'message', subject: 'it', verb: 'raises' });
    });

    it('reads a bare plural subject as the bare shape', () => {
      const candidates = detect('The library ships an idiom developers recognize.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ shape: 'bare', head: 'idiom', subject: 'developers', verb: 'recognize' });
    });

    it('reports the head, the subject, and the verb the reading turns on', () => {
      const candidates = detect('Reports the ticket the branch name encodes.');

      expect(candidates[0]).toMatchObject({
        head: 'ticket',
        subject: 'the branch name',
        verb: 'encodes',
        phrase: 'ticket the branch name encodes',
      });
    });
  });

  describe('verbs', () => {
    it.each([
      { sentence: 'Declares the version the consumer has for this kit.', verb: 'has' },
      { sentence: 'Reports the check it does on every run.', verb: 'does' },
    ])("reads a $verb carrying no lexical verb as the clause's own", ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb });
    });

    it.each([
      { sentence: 'Reports the state it found.', verb: 'found' },
      { sentence: 'Reports a message the console never wrote.', verb: 'wrote' },
      { sentence: 'Reports the ticket the branch name held.', verb: 'held' },
    ])('reads $verb, an irregular past tense that no suffix marks', ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb });
    });

    it('closes the subject on an irregular past tense rather than reading past it', () => {
      const candidates = detect('Reports the file the parser read was empty.');

      expect(candidates[0]).toMatchObject({ subject: 'the parser', verb: 'read' });
    });

    it('prefers the lexical verb an auxiliary carries over the auxiliary itself', () => {
      const candidates = detect('Declares the version the consumer has read.');

      expect(candidates[0]).toMatchObject({ verb: 'read', phrase: 'version the consumer has read' });
    });

    it.each([
      { sentence: 'Reports the level it is probed against.', phrase: 'level it is probed' },
      { sentence: 'Reports the file it may read.', phrase: 'file it may read' },
    ])("reads through an auxiliary filling a pronoun subject's whole window: $phrase", ({ sentence, phrase }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase });
    });

    it("holds a main-verb auxiliary to the bare subject's plural agreement", () => {
      expect(detect('Reports the fields records have.')).toHaveLength(1);
      expect(detect('Reports the fields records has.')).toStrictEqual([]);
    });
  });

  describe('scope', () => {
    it.each(OUT_OF_SCOPE_HEADS)('passes over %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('passes over a relativizer already in place', () => {
      expect(detect('The ticket that the branch name encodes is the value it reports.')).toHaveLength(1);
    });

    it('passes over a main clause, whose determiner reaches no noun before the verb', () => {
      expect(detect('An unset shell variable expands to the empty string.')).toStrictEqual([]);
    });

    it('passes over a subject that runs past the window', () => {
      expect(detect('The ticket a long and rather overqualified branch name encodes is unresolved.')).toStrictEqual([]);
    });

    it('passes over a participial phrase, whose participle no determiner turns into a head noun', () => {
      expect(detect('A package holding one drops it silently.')).toStrictEqual([]);
    });

    it('reads a specified gerund as a head noun, since a specifier is what makes one', () => {
      expect(detect('The wrapping two of them apply is identical.')).toHaveLength(1);
      expect(detect('Every wrapping two of them apply is identical.')).toHaveLength(1);
    });

    it('reads a quantified bare-noun subject, whose head a quantifier specifies', () => {
      expect(detect('The library ships every idiom developers recognize.')).toHaveLength(1);
    });
  });

  describe('location', () => {
    it('reports the line the site sits on within a wrapped block', () => {
      const candidates = detectCandidates([
        { file: 'docs/guide.md', line: 40, text: 'A clean first line.\nThen the source it names.' },
      ]);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ file: 'docs/guide.md', line: 41, sentence: 'Then the source it names.' });
    });
  });
});

// region | Helpers

/** Detects over one sentence held in a single span, which is how every lexical assertion below is phrased. */
function detect(sentence: string): Candidate[] {
  return detectCandidates([{ file: 'fixture.md', line: 1, text: sentence }]);
}

// endregion | Helpers

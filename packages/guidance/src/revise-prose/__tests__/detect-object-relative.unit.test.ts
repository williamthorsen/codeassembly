import { describe, expect, it } from 'vitest';

import { detectObjectRelatives } from '../detect-object-relative.ts';
import { detect } from '../test-utils/detect-sentence.ts';
import type { SubjectShape } from '../types.ts';

/**
 * The sites repaired by williamthorsen/toolbelt@5dd0ad2, each paired with the wording that replaced it. The commit is the
 * worked before-and-after for this rule, so its "before" column is the recall floor against which the detector is tuned and
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

/** The one replacement wording that still contains the construction, at a second site on the same line. */
const SURVIVING_SITE = 'A bound, offset, or key rejected by the library exits 2 carrying the message it raises.';

describe(detectObjectRelatives, () => {
  describe('the worked before-and-after', () => {
    it.each(REPAIRED_SITES)('reports $before', ({ before, shape }) => {
      const candidates = detect(before);

      expect(candidates[0]?.shape).toBe(shape);
      expect(candidates[0]?.sentence).toBe(before);
    });

    it.each(REPAIRED_SITES.filter(({ after }) => after !== SURVIVING_SITE))('passes over $after', ({ after }) => {
      expect(detect(after)).toStrictEqual([]);
    });

    it('reports the site left behind by the commit on a line that it otherwise repaired', () => {
      const candidates = detect(SURVIVING_SITE);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ shape: 'pronoun', head: 'message', subject: 'it', verb: 'raises' });
    });
  });

  describe('shapes', () => {
    it('reads a numeral-led subject as the quantified shape that the rulebook ranks worst', () => {
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
      'reads through a modal to the verb that it carries: %s',
      (sentence) => {
        expect(detect(sentence)).toHaveLength(1);
      },
    );

    it('passes over a modal not followed by any lexical verb', () => {
      expect(detect('Reports whether the file the parser should.')).toStrictEqual([]);
    });

    it('requires a plural head after a plural specifier, so a numeral beside a participle licenses nothing', () => {
      const candidates = detect('The key exits 2 carrying the message it raises.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'message', subject: 'it', verb: 'raises' });
    });

    it('reads a bare plural subject as the bare shape', () => {
      const candidates = detect('The library ships an idiom developers recognize.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ shape: 'bare', head: 'idiom', subject: 'developers', verb: 'recognize' });
    });

    it('reports the head, the subject, and the verb on which the reading turns', () => {
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
    ])("reads a $verb not followed by any lexical verb as the clause's own", ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb });
    });

    it.each([
      { sentence: 'Reports the state it found.', verb: 'found' },
      { sentence: 'Reports a message the console never wrote.', verb: 'wrote' },
      { sentence: 'Reports the ticket the branch name held.', verb: 'held' },
    ])('reads $verb, an irregular past tense not marked by any suffix', ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb });
    });

    it('closes the subject on an irregular past tense rather than reading past it', () => {
      const candidates = detect('Reports the file the parser read was empty.');

      expect(candidates[0]).toMatchObject({ subject: 'the parser', verb: 'read' });
    });

    it('prefers the lexical verb that an auxiliary carries over the auxiliary itself', () => {
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

    it('reaches a lexical verb three tokens past its auxiliary', () => {
      const candidates = detect('Reports the file it may not have read.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'file it may not have read' });
    });

    it('requires a main-verb auxiliary to agree with a plural bare subject', () => {
      expect(detect('Reports the fields records have.')).toHaveLength(1);
      expect(detect('Reports the fields records has.')).toStrictEqual([]);
    });

    it('reads through an adverb to the verb that the auxiliary carries', () => {
      const candidates = detect('Reports the file the parser may explicitly read.');

      expect(candidates[0]).toMatchObject({ verb: 'read', phrase: 'file the parser may explicitly read' });
    });

    it('reads a verb ending in `ly` as the verb rather than as the adverb that it resembles', () => {
      const candidates = detect('Drops an owned item the caller did not supply.');

      expect(candidates[0]).toMatchObject({ verb: 'supply', phrase: 'item the caller did not supply' });
    });
  });

  describe('voice', () => {
    it.each([
      'The library records some state transitions are recorded.',
      'The library ships audio files are used.',
      'The library names some release configurations are immutable.',
    ])('passes over a passive whose object is already promoted: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it.each([
      { sentence: 'Reports the source it was copied from.', phrase: 'source it was copied' },
      { sentence: 'Reports the level it is probed against.', phrase: 'level it is probed' },
    ])('reports a passive stranding a preposition: $phrase', ({ sentence, phrase }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase });
    });

    it('reports a passive whose infinitival complement carries the gap', () => {
      const candidates = detect('Hides the signal it was meant to convey.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'signal it was meant' });
    });

    it('reports a ditransitive passive, which promotes one object and leaves the other', () => {
      const candidates = detect('Narrows the sweep to the paths it is given.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'paths it is given' });
    });

    it('reads a progressive as active, so its object gap survives the voice test', () => {
      const candidates = detect('The message the console is writing is empty.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'message the console is writing' });
    });

    it("takes the voice from the chain's last auxiliary, not its first", () => {
      expect(detect('Declares the version the consumer has approved.')).toHaveLength(1);
      expect(detect('Reports the phase the ticket has been approved.')).toStrictEqual([]);
    });

    it('passes over a failed chain rather than letting the morphological test reach the participle', () => {
      expect(detect('Reports the phase the ticket was not approved.')).toStrictEqual([]);
    });

    it('closes on the copula with which a chain ends rather than on the auxiliary before it', () => {
      const candidates = detect('Declares the version the consumer has been.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb: 'been' });
    });

    it.each([
      { sentence: 'Names a file the producer does not have.', phrase: 'file the producer does not have' },
      { sentence: 'Declares the version the consumer has had.', phrase: 'version the consumer has had' },
    ])("closes the subject on the chain's own main verb: $phrase", ({ sentence, phrase }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase });
    });
  });

  describe('stranded prepositions', () => {
    it.each([
      { sentence: 'The set the entries belong to is closed.', phrase: 'set the entries belong' },
      { sentence: 'The levels systems depend on are fixed.', phrase: 'levels systems depend' },
      { sentence: 'Reports the state it may depend on.', phrase: 'state it may depend' },
    ])('reports one stranding a preposition: $phrase', ({ sentence, phrase }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase });
    });

    it.each([
      'The chain names mcp and factory depend on run-core.',
      'The rule states code changes go in the src directory.',
      'The convention holds qualifiers go in front.',
    ])('passes over one whose preposition takes an object of its own: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('reads the same verb the same way bare and under an auxiliary', () => {
      expect(detect('The levels systems depend on the parser are fixed.')).toStrictEqual([]);
      expect(detect('Reports the state it may depend on the parser.')).toStrictEqual([]);
    });

    it.each([
      { sentence: 'That is the consent these checks rest on.', verb: 'rest' },
      { sentence: 'The report names the baseline the values sit above.', verb: 'sit' },
    ])("still reports a verb absent from the detector's lexicons: $verb", ({ sentence, verb }) => {
      const candidates = detect(sentence);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb });
    });
  });

  describe('demonstrative subjects', () => {
    it('closes on the verb beside a demonstrative standing alone', () => {
      const candidates = detect('The reviewer opened a body this read in full and found no throw in.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'body', verb: 'read', shape: 'pronoun' });
    });

    it('keeps the pronoun shape when an adverb is between the demonstrative and the verb', () => {
      const candidates = detect('The reviewer opened a body this also read in full and found no throw in.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb: 'read', shape: 'pronoun' });
    });

    it('reads a demonstrative specifying a noun as the definite shape', () => {
      const candidates = detect('Reports the version this package declares, not an ancestor manifest.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ subject: 'this package', shape: 'definite' });
    });

    it('passes over a plural noun beside a demonstrative, which reads as the noun that it specifies', () => {
      const candidates = detect('The sweep repairs the checks these gates enforce.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb: 'enforce', shape: 'definite' });
    });
  });

  describe('predicate-nominal gaps', () => {
    it.each(['The double is the throwing mock it is.', 'The double is the throwing mock it also is.'])(
      'closes a clause on a copula that ends it: %s',
      (sentence) => {
        const candidates = detect(sentence);

        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toMatchObject({ head: 'mock', verb: 'is' });
      },
    );

    it('reads a trailing negator as leaving the complement slot open', () => {
      expect(detect('The double is the throwing mock it is not.')).toHaveLength(1);
    });

    it('passes over a copula that its own complement follows', () => {
      expect(detect('The double is the throwing mock it is today.')).toStrictEqual([]);
    });

    it('passes over a degree question, whose predicate is not a head noun', () => {
      expect(detect('Nobody said how big the problem is.')).toStrictEqual([]);
    });

    it.each([
      'Nobody said how many files the parser reads.',
      'Before asking, settle whose call it is.',
      'An ask is theirs however confident you are.',
    ])('passes over a head fronted by a wh-word, which binds its own gap: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it.each(['Nobody said how twelve files the parser reads.', 'Nobody said how 12 files the parser reads.'])(
      'crosses a numeral to the wh-word whichever way it is written: %s',
      (sentence) => {
        expect(detect(sentence)).toStrictEqual([]);
      },
    );

    it('keeps a genuine site nested inside a wh-clause', () => {
      expect(detect('Nobody said how the source it names got stale.')).toHaveLength(1);
    });

    it('closes on a copula with which an auxiliary chain ends', () => {
      const candidates = detect('Reports whether the file the parser should be.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'file', verb: 'be' });
    });
  });
});

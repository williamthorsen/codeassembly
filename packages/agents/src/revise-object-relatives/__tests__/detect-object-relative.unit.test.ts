import { describe, expect, it } from 'vitest';

import { detectObjectRelatives } from '../detect-object-relative.ts';
import { CODE_SPAN_PLACEHOLDER, maskCodeSpans } from '../mask-code-spans.ts';
import type { ObjectRelativeCandidate, SubjectShape } from '../types.ts';

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
      expect(detect('Reports whether the file the parser should.')).toStrictEqual([]);
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

    it('reaches a lexical verb three tokens past its auxiliary', () => {
      const candidates = detect('Reports the file it may not have read.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ phrase: 'file it may not have read' });
    });

    it("holds a main-verb auxiliary to the bare subject's plural agreement", () => {
      expect(detect('Reports the fields records have.')).toHaveLength(1);
      expect(detect('Reports the fields records has.')).toStrictEqual([]);
    });

    it('reads through an adverb to the verb the auxiliary carries', () => {
      const candidates = detect('Reports the file the parser may explicitly read.');

      expect(candidates[0]).toMatchObject({ verb: 'read', phrase: 'file the parser may explicitly read' });
    });

    it('reads a verb ending in `ly` as the verb rather than as the adverb it resembles', () => {
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

    it('closes on the copula a chain ends with rather than on the auxiliary before it', () => {
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
    ])('rescues a verb no lexicon holds: $verb', ({ sentence, verb }) => {
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

    it('keeps the pronoun shape where an adverb sits between the demonstrative and the verb', () => {
      const candidates = detect('The reviewer opened a body this also read in full and found no throw in.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ verb: 'read', shape: 'pronoun' });
    });

    it('reads a demonstrative specifying a noun as the definite shape', () => {
      const candidates = detect('Reports the version this package declares, not an ancestor manifest.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ subject: 'this package', shape: 'definite' });
    });

    it('passes over a plural noun beside a demonstrative, which reads as the noun it specifies', () => {
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

    it('passes over a degree question, whose predicate is no head noun', () => {
      expect(detect('Nobody said how big the problem is.')).toStrictEqual([]);
    });

    it.each([
      'Nobody said how many files the parser reads.',
      'Before asking, settle whose call it is.',
      'An ask is theirs however confident you are.',
    ])('passes over a head a wh-word fronts, which binds its own gap: %s', (sentence) => {
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

    it('closes on a copula an auxiliary chain ends with', () => {
      const candidates = detect('Reports whether the file the parser should be.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'file', verb: 'be' });
    });
  });

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
    ])('passes over a verb stranding no clause-final preposition: %s', (sentence) => {
      expect(detect(sentence)).toStrictEqual([]);
    });

    it('holds a verb an auxiliary carries to the same gate', () => {
      const stranded = detect('The sweep covers the sources this prose about the idioms has drawn on.');

      expect(stranded).toHaveLength(1);
      expect(stranded[0]).toMatchObject({ head: 'sources', verb: 'drawn' });
      expect(detect('The sweep covers the sources this prose about the idioms has listed.')).toStrictEqual([]);
    });

    it('holds a main-verb auxiliary to the same gate', () => {
      expect(detect('The sweep covers the sources this prose about the idioms has.')).toStrictEqual([]);
    });

    it('holds a partitive `of` to neither the raised ceiling nor the gate that pays for it', () => {
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
    ])('passes over an adverbial that would win the site on nearness: $head', ({ sentence, head, verb }) => {
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

    it('keeps a pro-form subject that no comparative precedes', () => {
      const candidates = detect('The report names the source one names.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'source', subject: 'one', verb: 'names' });
    });

    it('leaves a quantified subject that opens a real noun phrase to win on nearness', () => {
      const candidates = detect('Then retract the namespaces no source claims.');

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'namespaces', subject: 'no source', shape: 'quantified' });
    });

    it("reads an object pronoun as neither the verb nor a stranded preposition's gap", () => {
      const candidates = detect("Joins one kind's problems into the clause its error message reports them in.");

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ head: 'clause', verb: 'reports' });
    });

    it('keeps a filled preposition unstranded where an object pronoun fills it', () => {
      expect(detect('The store the entries belong to them is closed.')).toStrictEqual([]);
    });
  });

  describe('inline code', () => {
    it('reports no head noun drawn from a code span', () => {
      expect(detectMasked('Supplies the `_defaults` the subagent frontmatter merge applies.')).toStrictEqual([]);
    });

    it('reports no verb drawn from a code span', () => {
      expect(detectMasked('The directive uses `include` for that.')).toStrictEqual([]);
    });

    it('reports no embedded subject drawn from a code span', () => {
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
    it('reports the line the site sits on within a wrapped block', () => {
      const candidates = detectObjectRelatives([
        { file: 'docs/guide.md', line: 40, text: 'A clean first line.\nThen the source it names.' },
      ]);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ file: 'docs/guide.md', line: 41, sentence: 'Then the source it names.' });
    });
  });
});

// region | Helpers

/** Detects over one sentence held in a single span, which is how every lexical assertion below is phrased. */
function detect(sentence: string): ObjectRelativeCandidate[] {
  return detectObjectRelatives([{ file: 'fixture.md', line: 1, text: sentence }]);
}

/** Detects over one sentence masked as the extractor masks it, which is the form the detector reads in a sweep. */
function detectMasked(sentence: string): ObjectRelativeCandidate[] {
  return detect(maskCodeSpans(sentence));
}

// endregion | Helpers

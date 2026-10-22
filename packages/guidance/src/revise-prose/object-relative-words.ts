import type { SubjectKind, SubjectShape } from './types.ts';

/**
 * Head nouns whose relative clause has an adjunct gap rather than a gap in an argument position. The rulebook puts
 * these outside the rule on that ground alone; a prepositional-phrase gap fills an argument position and stays in.
 */
export const ADJUNCT_HEADS: ReadonlySet<string> = new Set([
  'place',
  'places',
  'reason',
  'reasons',
  'time',
  'times',
  'way',
  'ways',
]);

/**
 * How far past an auxiliary its lexical verb may appear, counted in tokens. Three is what `may not have read` needs,
 * since a skipped negator and a skipped auxiliary each consume one. The measure runs from the auxiliary rather than
 * from the subject, since a subject window bounds the subject alone and the one-token pronoun window doesn't leave an
 * auxiliary chain any room under it.
 */
export const CARRIED_VERB_WINDOW = 3;

/**
 * Comparative adjectives. One before a pro-form makes that pro-form its phrase's head rather than a subject.
 * Admission follows the rule that {@link BARE_VERBS} states, which keeps `header` and `parser` out.
 */
export const COMPARATIVE_ADJECTIVES: ReadonlySet<string> = new Set([
  'better',
  'bigger',
  'broader',
  'earlier',
  'larger',
  'later',
  'longer',
  'narrower',
  'newer',
  'older',
  'shorter',
  'smaller',
  'wider',
  'worse',
]);

/** Coordinators. One inside a subject ends the noun phrase, so the verb scan stops there. */
export const COORDINATORS: ReadonlySet<string> = new Set(['and', 'but', 'nor', 'or']);

/**
 * Adverbial pairs opened by a quantifier. Each is a phrase rather than a noun phrase, so it doesn't open a subject.
 * The set lists whole pairs because the second word alone decides nothing: `longer` and `later` are adjectives in `two
 * longer digests` and `many later drafts`, and every `-ly` adverb has an adjectival twin in `early`, `likely`, and
 * `timely`. Admission follows the rule that {@link BARE_VERBS} states, applied to the pair: An entry is a pair that
 * cannot be read as a noun phrase, which keeps `most likely` out, its `likely` heading one freely.
 */
export const DEGREE_ADVERBIALS: ReadonlySet<string> = new Set([
  'more reliably',
  'most notably',
  'most often',
  'most plausibly',
  'most recently',
  'no longer',
]);

/**
 * Determiners that also stand alone as a subject. `that` is absent: Between a head and a subject it is the overt
 * relativizer that the rule asks for, so a clause that it opens is already clean.
 */
export const DEMONSTRATIVES: ReadonlySet<string> = new Set(['these', 'this', 'those']);

/** Determiners, demonstratives, and possessives opening a definite noun phrase. `that` is a relativizer instead. */
export const DETERMINERS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'her',
  'his',
  'its',
  'my',
  'our',
  'the',
  'their',
  'these',
  'this',
  'those',
  'your',
]);

/**
 * The ceiling to which a crossed preposition raises the subject window, counted in tokens from the subject's first
 * word. A prepositional phrase inside a subject takes up several tokens, and once one is crossed,
 * {@link strandsClauseFinalPreposition} rather than the window provides the precision.
 */
export const EXTENDED_SUBJECT_WINDOW = 12;

/** Adverbs that may appear between a head noun and the subject without licensing the join. */
export const FOCUS_ADVERBS: ReadonlySet<string> = new Set([
  'almost',
  'also',
  'barely',
  'even',
  'hardly',
  'just',
  'merely',
  'nearly',
  'only',
  'simply',
]);

/**
 * Fused heads: a head that is its own relative pronoun. The rulebook puts these outside the rule on head type
 * alone, since the head is not a lexical noun.
 */
export const FUSED_HEADS: ReadonlySet<string> = new Set([
  'all',
  'anybody',
  'anyone',
  'anything',
  'enough',
  'everybody',
  'everyone',
  'everything',
  'less',
  'more',
  'much',
  'nobody',
  'none',
  'nothing',
  'somebody',
  'someone',
  'something',
  'what',
  'whatever',
  'whoever',
]);

/**
 * Quantifiers that fuse with a following `one`. Each has a single-word counterpart in {@link FUSED_HEADS}, which is
 * what admits it here: `no one` reads as `nobody` and doesn't take a relativizer. A partitive such as `another one`
 * or `each one` doesn't have such a counterpart and stays in scope, since a relativizer restores to it.
 */
export const FUSING_QUANTIFIERS: ReadonlySet<string> = new Set(['any', 'every', 'no', 'some']);

/**
 * Words ending in `ly` that cannot be read as an adverb, which the morphological test in {@link isMannerAdverb}
 * would otherwise skip. An entry is needed only for a word of five characters or more that neither verb lexicon
 * lists, since that function applies a length floor and consults both lexicons: `rely` is short enough for the floor
 * to reject, and `apply` and `imply` are covered by {@link BARE_VERBS}, so none of the three needs an entry here.
 */
export const LY_FINAL_NON_ADVERBS: ReadonlySet<string> = new Set([
  'anomaly',
  'assembly',
  'comply',
  'family',
  'monopoly',
  'multiply',
  'reply',
  'supply',
]);

/** Negators, which appear between an auxiliary and its verb. */
export const NEGATORS: ReadonlySet<string> = new Set(['never', 'not']);

/**
 * Modifiers that cannot be read as the head of a phrase they open. Each stands directly before the noun that it
 * modifies, so {@link findHeadIndex} would otherwise read the modifier as the head and the noun as a bare subject,
 * turning `the same rules apply` into a relative clause. Admission follows the rule that {@link BARE_VERBS} states,
 * narrowed to this position: A word that heads a phrase elsewhere, `former` and `latter` among them, is admitted
 * only when it cannot be read as a noun with a noun following it.
 */
export const NON_HEAD_MODIFIERS: ReadonlySet<string> = new Set(['other', 'own', 'same', 'single']);

/** Cardinals worth naming; a digit string is recognized by shape instead. */
export const NUMERALS: ReadonlySet<string> = new Set([
  'eight',
  'eleven',
  'five',
  'four',
  'nine',
  'one',
  'seven',
  'six',
  'ten',
  'three',
  'twelve',
  'two',
]);

/**
 * Object pronouns. One is not a verb or a head, and one after a preposition fills that preposition's object slot,
 * which is what keeps `the entries belong to them` from reading as a stranded preposition.
 */
export const OBJECT_PRONOUNS: ReadonlySet<string> = new Set(['her', 'him', 'me', 'them', 'us']);

/**
 * Specifiers other than a numeral that require a plural head, which is what number agreement holds them to. Every
 * numeral but `one` requires one too, and {@link isSpecifier} derives that half from {@link NUMERALS} rather than
 * restating it, so a numeral added there cannot specify differently from the ones beside it.
 */
export const PLURAL_SPECIFIERS: ReadonlySet<string> = new Set([
  'both',
  'few',
  'fewer',
  'many',
  'several',
  'these',
  'those',
]);

/** Prepositions. One between a head and a subject licenses the join. */
export const PREPOSITIONS: ReadonlySet<string> = new Set([
  'about',
  'above',
  'across',
  'after',
  'against',
  'along',
  'among',
  'around',
  'as',
  'at',
  'before',
  'behind',
  'below',
  'beneath',
  'beside',
  'besides',
  'between',
  'beyond',
  'by',
  'despite',
  'down',
  'during',
  'except',
  'for',
  'from',
  'in',
  'inside',
  'into',
  'like',
  'near',
  'of',
  'off',
  'on',
  'onto',
  'out',
  'outside',
  'over',
  'past',
  'per',
  'since',
  'through',
  'throughout',
  'to',
  'toward',
  'towards',
  'under',
  'underneath',
  'unlike',
  'until',
  'up',
  'upon',
  'via',
  'with',
  'within',
  'without',
]);

/**
 * The anaphoric one-series, which heads a relative clause without being a lexical noun. A relativizer restores to it,
 * which is what separates it from a fused head: `one that the spy carries` reads, whereas `everything that I know` is
 * already the fused form. Both members bypass the head tests, `one` because a numeral reading rejects it and `ones`
 * because its `-s` would otherwise demand a specifier.
 */
export const PRO_FORM_HEADS: ReadonlySet<string> = new Set(['one', 'ones']);

/** Quantifiers that stand alone as a subject, without a noun of their own. */
export const QUANTIFIER_PRONOUNS: ReadonlySet<string> = new Set([
  'anybody',
  'anyone',
  'anything',
  'everybody',
  'everyone',
  'everything',
  'nobody',
  'none',
  'nothing',
  'somebody',
  'someone',
  'something',
]);

/** Quantifiers opening a quantified noun phrase, the shape ranked worst by the rulebook. */
export const QUANTIFIERS: ReadonlySet<string> = new Set([
  'all',
  'another',
  'any',
  'both',
  'each',
  'either',
  'enough',
  'every',
  'few',
  'fewer',
  'many',
  'most',
  'neither',
  'no',
  'nobody',
  'none',
  'nothing',
  'several',
  'some',
  'such',
]);

/**
 * Relativizers. One between a head and a subject is the overt relativizer that the rule asks for, so the site is
 * clean.
 */
export const RELATIVIZERS: ReadonlySet<string> = new Set([
  'that',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
]);

/**
 * The shape under which each anchor reports, in the rulebook's own vocabulary. A demonstrative has none of its own:
 * It reports as a pronoun standing alone and as a definite noun phrase otherwise, which {@link resolveShape} reads
 * off where the verb closed.
 */
export const SHAPES_BY_KIND: Readonly<Record<Exclude<SubjectKind, 'demonstrative'>, SubjectShape>> = {
  bare: 'bare',
  determiner: 'definite',
  numeral: 'quantified',
  pronoun: 'pronoun',
  quantifier: 'quantified',
  'quantifier-pronoun': 'quantified',
};

/** Subject pronouns opening the mildest shape. */
export const SUBJECT_PRONOUNS: ReadonlySet<string> = new Set(['he', 'i', 'it', 'one', 'she', 'they', 'we', 'you']);

/**
 * The window in which each anchor's finite verb must fall, counted in tokens from the subject's first word. A
 * determiner, a numeral, and a quantifier each specify a noun, so the verb may not directly follow one; a pronoun
 * subject is one word, and so is a bare one, since nothing marks where a longer one would begin. Because a
 * demonstrative reads either way, its window spans both: one token when it stands alone, up to four when it
 * specifies a noun.
 */
export const SUBJECT_WINDOWS: Readonly<Record<SubjectKind, { min: number; max: number }>> = {
  bare: { min: 1, max: 1 },
  demonstrative: { min: 1, max: 4 },
  determiner: { min: 2, max: 4 },
  numeral: { min: 2, max: 4 },
  pronoun: { min: 1, max: 1 },
  quantifier: { min: 2, max: 4 },
  'quantifier-pronoun': { min: 1, max: 1 },
};

/** Subordinators. One between a head and a subject licenses the join. */
export const SUBORDINATORS: ReadonlySet<string> = new Set([
  'although',
  'because',
  'else',
  'if',
  'once',
  'so',
  'than',
  'then',
  'though',
  'unless',
  'until',
  'whether',
  'while',
  'yet',
]);

/**
 * Wh-words that put the phrase that they open into a clause of their own. Each already binds whatever gap follows
 * it, so a head inside that phrase doesn't have a relativizer to restore.
 */
export const WH_MARKERS: ReadonlySet<string> = new Set(['how', 'however', 'whose']);

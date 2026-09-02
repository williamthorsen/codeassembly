/**
 * Candidate detection for the revise-object-relatives sweep.
 *
 * The construction has no reliable surface form, so the anchor is adjacency rather than a verb pattern: a head noun
 * followed directly by the start of a new noun phrase, with no relativizer, preposition, conjunction, auxiliary, or
 * punctuation licensing the join. Three of the four shapes announce that new phrase with a closed-class word; the
 * bare-noun shape announces nothing, and is anchored on a plural subject instead.
 *
 * Detection is deliberately over-inclusive: precision is the agent's, which adjudicates each candidate with the
 * sentence in view. Five things are nonetheless decided here, because each is decidable without a reading. The
 * rulebook's two out-of-scope heads, the fused head and the adjunct relative, are rejected by head type, as is the
 * predicate of a degree question, which no copula after it turns into a head noun. A word
 * carrying verbal morphology is read as a head noun only where a determiner makes it one, which is what keeps a main
 * clause and most participial phrases out. A bare-noun subject is held to plural agreement. And a clause with no gap
 * left for the head noun to fill is rejected: a passive has promoted its own object, so it reports only where a
 * stranded preposition, an infinitival complement, or a ditransitive leaves a second one open, and an intransitive
 * verb reports only where it strands a preposition. A copula takes no object at all, and closes a clause only at the
 * end of one, where the head fills its complement slot.
 */
import type { Candidate, ProseSpan, SubjectShape } from './types.ts';

/** Scans every span for the construction, returning one candidate per site in reading order. */
export function detectCandidates(spans: readonly ProseSpan[]): Candidate[] {
  const candidates: Candidate[] = [];
  for (const span of spans) {
    candidates.push(...detectInSpan(span));
  }
  return candidates;
}

// region | Helpers

/** Auxiliary and modal verbs. One between a head and a subject licenses the join; one after a subject discharges it. */
const AUXILIARIES: ReadonlySet<string> = new Set([
  'am',
  'are',
  'be',
  'been',
  'being',
  'can',
  'could',
  'did',
  'do',
  'does',
  'had',
  'has',
  'have',
  'is',
  'may',
  'might',
  'must',
  'shall',
  'should',
  'was',
  'were',
  'will',
  'would',
]);

/**
 * Head nouns whose relative clause has an adjunct gap rather than a gap in an argument position. The rulebook puts
 * these outside the rule on that ground alone; a prepositional-phrase gap fills an argument position and stays in.
 */
const ADJUNCT_HEADS: ReadonlySet<string> = new Set([
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
 * Verbs whose bare form carries no verbal morphology, so nothing but a lexicon recognizes one. Every entry is a
 * word that no reading takes as a noun: a homograph such as `name` or `report` would read a head noun as a verb.
 */
const BARE_VERBS: ReadonlySet<string> = new Set([
  'accept',
  'acknowledge',
  'allow',
  'apply',
  'assume',
  'avoid',
  'begin',
  'believe',
  'bring',
  'choose',
  'compare',
  'comprise',
  'consider',
  'contain',
  'convey',
  'create',
  'decide',
  'declare',
  'define',
  'deliver',
  'describe',
  'determine',
  'discard',
  'distinguish',
  'emit',
  'enable',
  'encode',
  'enforce',
  'ensure',
  'exclude',
  'expect',
  'explain',
  'extend',
  'extract',
  'follow',
  'forbid',
  'govern',
  'hide',
  'ignore',
  'imply',
  'include',
  'inherit',
  'invoke',
  'know',
  'leave',
  'lose',
  'maintain',
  'mean',
  'mention',
  'obtain',
  'omit',
  'perform',
  'permit',
  'prefer',
  'prevent',
  'produce',
  'provide',
  'receive',
  'recognize',
  'reduce',
  'reject',
  'remove',
  'render',
  'repeat',
  'replace',
  'require',
  'resolve',
  'retain',
  'reveal',
  'satisfy',
  'seek',
  'select',
  'send',
  'solve',
  'suppose',
  'surround',
  'sustain',
  'teach',
  'tolerate',
  'treat',
  'understand',
  'verify',
  'want',
  'withhold',
]);

/**
 * Forms of `be`. A chain ending in one reads as passive or copular rather than active, which is what decides whether
 * the clause that it closes still has an object gap to fill.
 */
const BE_FORMS: ReadonlySet<string> = new Set(['am', 'are', 'be', 'been', 'being', 'is', 'was', 'were']);

/**
 * Verbs that take no object. One of these closing a subject reads as the sentence's own verb rather than a
 * relative's, which is what keeps a main clause out. The set is read from both directions: {@link isFiniteVerb}
 * rejects a member outright, and the two clause-closing tests admit one back where a stranded preposition gives it a
 * prepositional-phrase gap, so `the set the entries belong to` reports where `the entries belong to the set` does not.
 */
const INTRANSITIVE_VERBS: ReadonlySet<string> = new Set([
  'appear',
  'arise',
  'become',
  'belong',
  'come',
  'consist',
  'depend',
  'differ',
  'emerge',
  'exist',
  'go',
  'happen',
  'matter',
  'occur',
  'persist',
  'remain',
  'stay',
  'vary',
]);

/**
 * Past-tense forms that no suffix marks as a verb, so nothing but a lexicon recognizes one. Admission follows the
 * rule {@link BARE_VERBS} states: every entry is a word that no reading takes as a noun, which keeps `cost`, `cut`,
 * `hit`, `put`, `run`, `saw`, `set`, `split`, and `spread` out. A past participle needs no entry, since
 * {@link resolveAuxiliaryChain} admits whatever an auxiliary carries.
 */
const IRREGULAR_PAST_VERBS: ReadonlySet<string> = new Set([
  'began',
  'bought',
  'broke',
  'brought',
  'built',
  'caught',
  'chose',
  'dealt',
  'drew',
  'drove',
  'found',
  'gave',
  'grew',
  'held',
  'kept',
  'knew',
  'laid',
  'led',
  'left',
  'lent',
  'lost',
  'made',
  'meant',
  'met',
  'paid',
  'read',
  'said',
  'sent',
  'sold',
  'sought',
  'spent',
  'struck',
  'swept',
  'taught',
  'thought',
  'threw',
  'told',
  'took',
  'understood',
  'withheld',
  'won',
  'wrote',
]);

/**
 * How far past an auxiliary its lexical verb may sit, counted in tokens. Three is what `may not have read` needs,
 * since a skipped negator and a skipped auxiliary each consume one. The measure runs from the auxiliary rather than
 * from the subject, since a subject window bounds the subject alone and the one-token pronoun window leaves an
 * auxiliary chain no room under it.
 */
const CARRIED_VERB_WINDOW = 3;

/** Coordinators. One inside a subject ends the noun phrase, so the verb scan stops there. */
const COORDINATORS: ReadonlySet<string> = new Set(['and', 'but', 'nor', 'or']);

/** Determiners, demonstratives, and possessives opening a definite noun phrase. `that` is a relativizer instead. */
const DETERMINERS: ReadonlySet<string> = new Set([
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
 * Determiners that also stand alone as a subject. `that` is absent: between a head and a subject it is the overt
 * relativizer the rule asks for, so a clause it opens is already clean.
 */
const DEMONSTRATIVES: ReadonlySet<string> = new Set(['these', 'this', 'those']);

/**
 * Participles whose verb takes two objects. A passive promotes one and leaves the other open, so a head noun can fill
 * the gap that remains: `the paths it is given` is the construction where `the paths it is used` is not.
 */
const DITRANSITIVE_PARTICIPLES: ReadonlySet<string> = new Set([
  'assigned',
  'awarded',
  'given',
  'granted',
  'handed',
  'issued',
  'offered',
  'passed',
  'sent',
  'shown',
  'taught',
  'told',
]);

/** Adverbs that may sit between a head noun and the subject without licensing the join. */
const FOCUS_ADVERBS: ReadonlySet<string> = new Set([
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
 * Quantifiers that fuse with a following `one`. Each has a single-word counterpart in {@link FUSED_HEADS}, which is
 * what admits it here: `no one` reads as `nobody` and takes no relativizer. A partitive such as `another one` or
 * `each one` has no such counterpart and stays in scope, since a relativizer restores to it.
 */
const FUSING_QUANTIFIERS: ReadonlySet<string> = new Set(['any', 'every', 'no', 'some']);

/**
 * Fused heads: a head that is its own relative pronoun. The rulebook puts these outside the rule on head type
 * alone, since the head is not a lexical noun.
 */
const FUSED_HEADS: ReadonlySet<string> = new Set([
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
 * Words ending in `ly` that no reading takes as an adverb, which the morphological test in {@link isMannerAdverb}
 * would otherwise skip. An entry is needed only for a word of five characters or more that neither verb lexicon
 * holds, since that function applies a length floor and consults both lexicons: `rely` is short enough for the floor
 * to reject, and `apply` and `imply` are covered by {@link BARE_VERBS}, so none of the three needs an entry here.
 */
const LY_FINAL_NON_ADVERBS: ReadonlySet<string> = new Set([
  'anomaly',
  'assembly',
  'comply',
  'family',
  'monopoly',
  'multiply',
  'reply',
  'supply',
]);

/**
 * Auxiliaries that also serve as a clause's transitive main verb, which is what `the version the consumer has` turns
 * on. A `be` form is absent: a copula takes no object, so a clause that it closes has no gap to find.
 */
const MAIN_VERB_AUXILIARIES: ReadonlySet<string> = new Set(['did', 'do', 'does', 'had', 'has', 'have']);

/** Cardinals worth naming; a digit string is recognized by shape instead. */
const NUMERALS: ReadonlySet<string> = new Set([
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

/** Negators, which sit between an auxiliary and its verb. */
const NEGATORS: ReadonlySet<string> = new Set(['never', 'not']);

/**
 * Modifiers that no reading takes as the head of a phrase they open. Each stands directly before the noun that it
 * modifies, so {@link findHeadIndex} would otherwise read the modifier as the head and the noun as a bare subject,
 * turning `the same rules apply` into a relative clause. Admission follows the rule {@link BARE_VERBS} states,
 * narrowed to this position: a word that heads a phrase elsewhere, `former` and `latter` among them, is admitted
 * only where no reading takes it as a noun with a noun following it.
 */
const NON_HEAD_MODIFIERS: ReadonlySet<string> = new Set(['other', 'own', 'same', 'single']);

/**
 * Specifiers other than a numeral that require a plural head, which is what number agreement holds them to. Every
 * numeral but `one` requires one too, and {@link isSpecifier} derives that half from {@link NUMERALS} rather than
 * restating it, so a numeral added there cannot specify differently from the ones beside it.
 */
const PLURAL_SPECIFIERS: ReadonlySet<string> = new Set(['both', 'few', 'fewer', 'many', 'several', 'these', 'those']);

/** Prepositions. One between a head and a subject licenses the join. */
const PREPOSITIONS: ReadonlySet<string> = new Set([
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
 * which is what separates it from a fused head: `one that the spy carries` reads where `everything that I know` is
 * already the fused form. Both members bypass the head tests, `one` because a numeral reading rejects it and `ones`
 * because its `-s` would otherwise demand a specifier.
 */
const PRO_FORM_HEADS: ReadonlySet<string> = new Set(['one', 'ones']);

/**
 * Object pronouns. One is no verb and no head, and one after a preposition fills that preposition's object slot,
 * which is what keeps `the entries belong to them` from reading as a stranded preposition.
 */
const OBJECT_PRONOUNS: ReadonlySet<string> = new Set(['her', 'him', 'me', 'them', 'us']);

/** Quantifiers that stand alone as a subject, taking no noun of their own. */
const QUANTIFIER_PRONOUNS: ReadonlySet<string> = new Set([
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
const QUANTIFIERS: ReadonlySet<string> = new Set([
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
const RELATIVIZERS: ReadonlySet<string> = new Set(['that', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why']);

/** Subject pronouns opening the mildest shape. */
const SUBJECT_PRONOUNS: ReadonlySet<string> = new Set(['he', 'i', 'it', 'one', 'she', 'they', 'we', 'you']);

/**
 * The window in which each anchor's finite verb must fall, counted in tokens from the subject's first word. A
 * determiner, a numeral, and a quantifier each specify a noun, so the verb may not sit directly on one; a pronoun
 * subject is one word, and so is a bare one, since nothing marks where a longer one would begin. A demonstrative
 * reads either way, so it spans both: one token where it stands alone, up to four where it specifies a noun.
 */
const SUBJECT_WINDOWS: Readonly<Record<SubjectKind, { min: number; max: number }>> = {
  bare: { min: 1, max: 1 },
  demonstrative: { min: 1, max: 4 },
  determiner: { min: 2, max: 4 },
  numeral: { min: 2, max: 4 },
  pronoun: { min: 1, max: 1 },
  quantifier: { min: 2, max: 4 },
  'quantifier-pronoun': { min: 1, max: 1 },
};

/**
 * The ceiling a crossed preposition raises the subject window to, counted in tokens from the subject's first word. A
 * prepositional phrase inside a subject costs several tokens, and {@link strandsClauseFinalPreposition} rather than
 * the window is what carries precision once one is crossed.
 */
const EXTENDED_SUBJECT_WINDOW = 12;

/** What opens an embedded subject, which decides its window. Several kinds report under one shape. */
type SubjectKind =
  'bare' | 'demonstrative' | 'determiner' | 'numeral' | 'pronoun' | 'quantifier' | 'quantifier-pronoun';

/**
 * The shape under which each anchor reports, in the rulebook's own vocabulary. A demonstrative has none of its own:
 * it reports as a pronoun standing alone and as a definite noun phrase otherwise, which {@link resolveShape} reads
 * off where the verb closed.
 */
const SHAPES_BY_KIND: Readonly<Record<Exclude<SubjectKind, 'demonstrative'>, SubjectShape>> = {
  bare: 'bare',
  determiner: 'definite',
  numeral: 'quantified',
  pronoun: 'pronoun',
  quantifier: 'quantified',
  'quantifier-pronoun': 'quantified',
};

/** Subordinators. One between a head and a subject licenses the join. */
const SUBORDINATORS: ReadonlySet<string> = new Set([
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
 * Wh-words that put the phrase they open into a clause of their own. Each already binds whatever gap follows it, so
 * a head inside that phrase has no relativizer to restore.
 */
const WH_MARKERS: ReadonlySet<string> = new Set(['how', 'however', 'whose']);

/** Words ending in `s` that no reading takes as a verb, which the morphological test would otherwise admit. */
const S_FINAL_NON_VERBS: ReadonlySet<string> = new Set([
  'always',
  'hers',
  'ours',
  'perhaps',
  'plus',
  'sometimes',
  'theirs',
  'thus',
  'versus',
  'yes',
  'yours',
]);

/** The auxiliary chain opening at one auxiliary: what it carries, how that reads, and where the chain ends. */
interface AuxiliaryChain {
  /** Index of the lexical verb carried by the chain, or undefined where it carries none. */
  carriedIndex: number | undefined;
  /** Whether the chain's last auxiliary is a `be` form carrying something other than an `-ing` form. */
  isPassive: boolean;
  /** Index of the chain's last auxiliary, which is the clause's main verb where the chain carries none. */
  lastAuxiliaryIndex: number;
}

/** One word of a span, with the offsets a report and a line lookup are computed from. */
interface Token {
  /** The word as written, stripped of the punctuation around it. */
  raw: string;
  /** The word lowercased, which every lexical test reads. */
  word: string;
  /** Offset of the word's first character within the span's text. */
  start: number;
  /** Offset just past the word's last character. */
  end: number;
  /** Whether clause punctuation separates this word from the one before it. */
  afterBreak: boolean;
}

/** Punctuation that ends a clause where it adjoins a word; standing alone, any punctuation ends one. */
const CLAUSE_BREAK_PATTERN = /[,;:.!?()[\]{}"\u{2013}\u{2014}]/u;

/** Reports whether a verb agrees with a plural subject, which is what a bare-noun subject always is. */
function agreesWithPluralSubject(word: string): boolean {
  return !word.endsWith('s');
}

/** Builds one candidate from a resolved head, subject, and verb, reading its sentence out of the span. */
function buildCandidate(input: {
  span: ProseSpan;
  tokens: readonly Token[];
  headIndex: number;
  subjectIndex: number;
  verbIndex: number;
  shape: SubjectShape;
}): Candidate {
  const { span, tokens, headIndex, subjectIndex, verbIndex, shape } = input;
  const head = tokens[headIndex];
  const verb = tokens[verbIndex];
  if (head === undefined || verb === undefined) throw new Error('candidate resolved outside its token run');

  const subject = tokens
    .slice(subjectIndex, verbIndex)
    .map((token) => token.raw)
    .join(' ');

  return {
    file: span.file,
    line: span.line + countNewlinesBefore(span.text, head.start),
    shape,
    head: head.raw,
    subject,
    verb: verb.raw,
    phrase: flattenWhitespace(span.text.slice(head.start, verb.end)),
    sentence: findSentence(span.text, head.start, verb.end),
  };
}

/**
 * Counts the newlines preceding `offset`, which is how a span's own line maps to the line on which a candidate sits.
 */
function countNewlinesBefore(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Scans one span for every site that the construction may occupy. A later anchor whose head falls inside an accepted
 * phrase is that same site read from one word further in: where it closes on the same verb it replaces the reading
 * before it, the nearer head being the tighter one, and where it closes elsewhere it is dropped. A distant head can
 * reach a verb across a crossed preposition, so first found is not the reading to keep.
 */
function detectInSpan(span: ProseSpan): Candidate[] {
  const tokens = tokenize(span.text);
  const candidates: Candidate[] = [];
  let claimedThrough = -1;

  for (let index = 1; index < tokens.length; index += 1) {
    const headIndex = findHeadIndex(tokens, index);
    if (headIndex === undefined) continue;
    const rereadsClaimedSite = headIndex <= claimedThrough;

    const kind = classifySubject(tokens, index);
    if (kind === undefined) continue;
    if (kind === 'bare' && !isDeterminedPhrase(tokens, headIndex)) continue;

    const verbIndex = findVerbIndex(tokens, index, kind);
    if (verbIndex === undefined) continue;
    if (rereadsClaimedSite && verbIndex !== claimedThrough) continue;

    claimedThrough = verbIndex;
    const shape = resolveShape({ tokens, kind, subjectIndex: index, verbIndex });
    const candidate = buildCandidate({ span, tokens, headIndex, subjectIndex: index, verbIndex, shape });
    if (rereadsClaimedSite) candidates[candidates.length - 1] = candidate;
    else candidates.push(candidate);
  }

  return candidates;
}

/**
 * Classifies what a token opens an embedded subject with, or reports undefined where it opens none. Five kinds are
 * read off closed classes; the bare kind has no marker, so a plural noun stands in for one. A demonstrative is
 * tested ahead of the determiner it also belongs to, since it alone of the determiners stands as a subject by itself.
 */
function classifySubject(tokens: readonly Token[], index: number): SubjectKind | undefined {
  const token = tokens[index];
  if (token === undefined) return undefined;
  const { word } = token;

  if (SUBJECT_PRONOUNS.has(word)) return 'pronoun';
  if (NUMERALS.has(word) || /^\d+$/.test(word)) return 'numeral';
  if (QUANTIFIER_PRONOUNS.has(word)) return 'quantifier-pronoun';
  if (QUANTIFIERS.has(word)) return 'quantifier';
  if (DEMONSTRATIVES.has(word)) return 'demonstrative';
  if (DETERMINERS.has(word)) return 'determiner';
  return isPluralNoun(word) ? 'bare' : undefined;
}

/** Collapses a phrase's own newlines and runs of spaces, so a wrapped site reads as one line in the report. */
function flattenWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Returns the index of the head noun a subject at `subjectIndex` attaches to, or undefined where nothing there can be
 * one. A focus adverb may intervene; a licensing word, clause punctuation, a fused head, an adjunct head, or a
 * modifier that no reading takes as a noun cannot, and neither can a wh-word, which heads no noun phrase. A pro-form
 * head is admitted ahead of those tests, since the numeral reading of `one` and the verbal reading of `ones` would
 * each reject it.
 */
function findHeadIndex(tokens: readonly Token[], subjectIndex: number): number | undefined {
  let index = subjectIndex;
  while (index > 0) {
    const candidate = tokens[index];
    if (candidate === undefined || candidate.afterBreak) return undefined;
    index -= 1;
    const head = tokens[index];
    if (head === undefined) return undefined;
    if (FOCUS_ADVERBS.has(head.word)) continue;
    if (PRO_FORM_HEADS.has(head.word)) return isFusedProForm(tokens, index) ? undefined : index;
    if (isWhMarkedHead(tokens, index)) return undefined;
    if (isFunctionWord(head.word) || FUSED_HEADS.has(head.word) || ADJUNCT_HEADS.has(head.word)) return undefined;
    if (WH_MARKERS.has(head.word)) return undefined;
    if (NON_HEAD_MODIFIERS.has(head.word)) return undefined;
    if (isVerbPosition(tokens, index)) return undefined;
    return isDeterminedHead(tokens, index) ? index : undefined;
  }
  return undefined;
}

/**
 * Reports whether a wh-word opens the phrase the token at `headIndex` heads. A fronted wh-phrase binds the gap after
 * it, so no relativizer is restorable and the rule governs nothing there: `how big the problem is`, `whose call it
 * is`, and `how many files the parser reads` are questions rather than heads with gaps.
 *
 * The walk crosses a quantifier or a numeral, which stays inside the wh-phrase, and stops at a determiner, which
 * opens a phrase of its own. That is what leaves a genuine site nested in a wh-clause alone, as in `how the source it
 * names got stale`. A wh-word two or more tokens out with a determiner between, as in `what kind of content it is`,
 * is out of reach: reaching it needs a clause-level test, which would reject the nested sites too.
 */
function isWhMarkedHead(tokens: readonly Token[], headIndex: number): boolean {
  for (let index = headIndex - 1; index >= 0; index -= 1) {
    const following = tokens[index + 1];
    if (following === undefined || following.afterBreak) return false;
    const word = tokens[index]?.word ?? '';
    if (WH_MARKERS.has(word)) return true;
    if (!QUANTIFIERS.has(word) && !NUMERALS.has(word)) return false;
  }
  return false;
}

/**
 * Reports whether a pro-form head at `headIndex` fuses with the quantifier before it, as `no one` does. A fused
 * reading is its own relative pronoun and takes no relativizer, so the rule leaves it alone.
 */
function isFusedProForm(tokens: readonly Token[], headIndex: number): boolean {
  if (headIndex === 0 || tokens[headIndex]?.afterBreak === true) return false;
  return FUSING_QUANTIFIERS.has(tokens[headIndex - 1]?.word ?? '');
}

/**
 * Reports whether a word carrying verbal morphology is nonetheless heading a noun phrase, which a specifier before it
 * is what settles. Without one, an `-s` form is the clause's own verb and an `-ing` form is a participle, so reading
 * either as a head noun produces a whole clause dressed as a relative.
 */
function isDeterminedHead(tokens: readonly Token[], headIndex: number): boolean {
  const head = tokens[headIndex];
  if (head === undefined) return false;
  if (!isFiniteVerb(head.word) && !head.word.endsWith('ing')) return true;
  if (head.afterBreak || headIndex === 0) return false;
  return isSpecifier(tokens[headIndex - 1]?.word ?? '', head.word);
}

/**
 * Reports whether a specifier opens the phrase a head at `headIndex` closes, allowing one modifier between the two.
 * A bare-noun subject carries no marker of its own, so this is what keeps a plain `Noun Nouns Verb` main clause from
 * reading as a relative clause.
 */
function isDeterminedPhrase(tokens: readonly Token[], headIndex: number): boolean {
  for (let index = headIndex - 1; index >= 0 && index >= headIndex - 2; index -= 1) {
    const token = tokens[index];
    if (token === undefined) return false;
    if (isSpecifier(token.word, tokens[headIndex]?.word ?? '')) return true;
    if (tokens[index + 1]?.afterBreak === true) return false;
  }
  return false;
}

/**
 * Returns the index of the finite verb closing a subject that opens at `subjectIndex`, or undefined where none falls
 * within that kind's window. The scan stops at anything that ends the noun phrase: a coordinator, a relativizer, and
 * every preposition but `of`, which a partitive such as `two of them` needs. A bare subject is additionally held to
 * plural agreement, which is the only reading its own form supports. A chain carrying no lexical verb closes the
 * subject on its last auxiliary where that is a {@link MAIN_VERB_AUXILIARIES} member, since a main-verb reading is
 * what remains: `the file the producer does not have` closes on `have`. A chain ending in a `be` form closes on that
 * form instead, where {@link closesOnCopula} holds, so `the version the consumer has been` closes on `been`.
 *
 * An auxiliary chain that the clause fails is the end of the subject rather than a token to scan past. Continuing
 * would let the morphological test reach the same participle a second time and report what the chain just rejected.
 *
 * A preposition other than `of` opens a phrase inside the subject rather than ending it, and raises the ceiling to
 * {@link EXTENDED_SUBJECT_WINDOW} so a subject holding one is still reachable. Precision then passes from the window
 * to {@link strandsClauseFinalPreposition}: past a crossed preposition only a verb stranding a clause-final
 * preposition closes the clause, which is what tells the `lives` of `the sources this prose about the idioms lives
 * in` from the `idioms` before it. A direct-object gap behind such a subject is out of reach, the price of a window
 * this wide.
 *
 * An adverb or a negator between the subject and the verb raises the ceiling by one rather than spending a token of
 * it, mirroring what {@link resolveAuxiliaryChain} reads through, so `the source it also names` reports as `the
 * source it names` does.
 *
 * A demonstrative standing alone closes on the token beside it, but not on one reading as a plural noun:
 * {@link isFiniteVerb} cannot tell that from a verb, and the noun a demonstrative specifies is the likelier reading.
 */
function findVerbIndex(tokens: readonly Token[], subjectIndex: number, kind: SubjectKind): number | undefined {
  const window = SUBJECT_WINDOWS[kind];
  const first = subjectIndex + window.min;
  let last = Math.min(subjectIndex + window.max, tokens.length - 1);
  let crossedPreposition = false;

  for (let index = subjectIndex + 1; index <= last; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.afterBreak) return undefined;
    if (COORDINATORS.has(token.word) || RELATIVIZERS.has(token.word)) return undefined;
    if (PREPOSITIONS.has(token.word) && token.word !== 'of') {
      crossedPreposition = true;
      last = Math.min(subjectIndex + EXTENDED_SUBJECT_WINDOW, tokens.length - 1);
      continue;
    }
    if (skipsAsModifier(token.word)) {
      last = Math.min(last + 1, tokens.length - 1);
      continue;
    }

    const step =
      AUXILIARIES.has(token.word) && index >= first
        ? resolveAuxiliaryStep({ tokens, index, kind, crossedPreposition })
        : resolveScannedStep({ tokens, index, subjectIndex, first, kind, crossedPreposition });
    if (step.outcome === 'close') return step.verbIndex;
    if (step.outcome === 'stop') return undefined;
  }
  return undefined;
}

/**
 * Resolves the shape an anchor reports under. Every kind but the demonstrative has one of its own; a demonstrative
 * reports as a pronoun where it stands alone as the subject and as a definite noun phrase where it specifies a noun.
 * What separates the two is whether the scan crossed a noun rather than how far the verb sits, since
 * {@link skipsAsModifier} moves the verb one token further for every adverb it reads through.
 */
function resolveShape(input: {
  tokens: readonly Token[];
  kind: SubjectKind;
  subjectIndex: number;
  verbIndex: number;
}): SubjectShape {
  const { tokens, kind, subjectIndex, verbIndex } = input;
  if (kind !== 'demonstrative') return SHAPES_BY_KIND[kind];
  return standsAlone(tokens, subjectIndex, verbIndex) ? 'pronoun' : 'definite';
}

/**
 * Reports whether the subject opening at `subjectIndex` is that token alone, every token between it and the verb
 * being a modifier the scan read through.
 */
function standsAlone(tokens: readonly Token[], subjectIndex: number, verbIndex: number): boolean {
  for (let index = subjectIndex + 1; index < verbIndex; index += 1) {
    if (!skipsAsModifier(tokens[index]?.word ?? '')) return false;
  }
  return true;
}

/** What one scanned token does to the search: closes it on a verb, ends it, or leaves it running. */
type ScanStep = { outcome: 'close'; verbIndex: number } | { outcome: 'continue' } | { outcome: 'stop' };

/** Reports whether a word stands between a subject and its verb without being either. */
function skipsAsModifier(word: string): boolean {
  return NEGATORS.has(word) || FOCUS_ADVERBS.has(word) || isMannerAdverb(word);
}

/**
 * Resolves what an auxiliary at `index` does to the search. A chain carrying a lexical verb closes on that verb or
 * ends the search, since the chain it failed is the end of the subject; a chain carrying none closes on its last
 * auxiliary where that reads as the clause's own verb, either as a copula at the end of its clause or as a main-verb
 * auxiliary such as `has`.
 */
function resolveAuxiliaryStep(input: {
  tokens: readonly Token[];
  index: number;
  kind: SubjectKind;
  crossedPreposition: boolean;
}): ScanStep {
  const { tokens, index, kind, crossedPreposition } = input;
  const chain = resolveAuxiliaryChain(tokens, index);

  if (chain.carriedIndex !== undefined) {
    const carried = closeOnCarriedVerb(tokens, chain);
    if (carried === undefined) return { outcome: 'stop' };
    if (crossedPreposition && !strandsClauseFinalPreposition(tokens, carried)) return { outcome: 'stop' };
    return { outcome: 'close', verbIndex: carried };
  }

  const lastAuxiliary = tokens[chain.lastAuxiliaryIndex]?.word ?? '';
  if (BE_FORMS.has(lastAuxiliary) && closesOnCopula(tokens, chain.lastAuxiliaryIndex)) {
    return { outcome: 'close', verbIndex: chain.lastAuxiliaryIndex };
  }
  if (!MAIN_VERB_AUXILIARIES.has(lastAuxiliary)) return { outcome: 'continue' };
  if (crossedPreposition && !strandsClauseFinalPreposition(tokens, chain.lastAuxiliaryIndex))
    return { outcome: 'continue' };
  if (kind === 'bare' && !agreesWithPluralSubject(tokens[index]?.word ?? '')) return { outcome: 'stop' };
  return { outcome: 'close', verbIndex: chain.lastAuxiliaryIndex };
}

/**
 * Resolves what a token reached by the scan rather than through an auxiliary does to the search. A bare subject that
 * a verb disagrees with in number ends the search, since no other reading of that subject is available; everything
 * else the tests reject leaves the scan running.
 */
function resolveScannedStep(input: {
  tokens: readonly Token[];
  index: number;
  subjectIndex: number;
  first: number;
  kind: SubjectKind;
  crossedPreposition: boolean;
}): ScanStep {
  const { tokens, index, subjectIndex, first, kind, crossedPreposition } = input;
  const word = tokens[index]?.word ?? '';

  if (index < first || !closesScannedClause(tokens, index, kind)) return { outcome: 'continue' };
  if (kind === 'demonstrative' && index === subjectIndex + 1 && isPluralNoun(word)) return { outcome: 'continue' };
  if (crossedPreposition && !strandsClauseFinalPreposition(tokens, index)) return { outcome: 'continue' };
  if (kind === 'bare' && !agreesWithPluralSubject(word)) return { outcome: 'stop' };
  return { outcome: 'close', verbIndex: index };
}

/**
 * Resolves the auxiliary chain opening at `auxiliaryIndex`: the lexical verb that it carries within
 * {@link CARRIED_VERB_WINDOW}, how that verb reads, and which auxiliary ends the chain. A modal is always followed by
 * a verb, which is what lets `the file the parser may read` be found where the morphological test sees nothing on
 * `read`; a further auxiliary, a negator, and an adverb between the two are skipped.
 *
 * The voice is read off the chain's last auxiliary rather than its first, so `has been approved` is passive where
 * `has approved` is active. A `be` form carrying an `-ing` form is progressive, which leaves the object gap open.
 */
function resolveAuxiliaryChain(tokens: readonly Token[], auxiliaryIndex: number): AuxiliaryChain {
  const last = Math.min(auxiliaryIndex + CARRIED_VERB_WINDOW, tokens.length - 1);
  let lastAuxiliaryIndex = auxiliaryIndex;

  for (let index = auxiliaryIndex + 1; index <= last; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.afterBreak) break;
    if (AUXILIARIES.has(token.word)) {
      lastAuxiliaryIndex = index;
      continue;
    }
    if (NEGATORS.has(token.word) || isMannerAdverb(token.word)) continue;
    if (isFunctionWord(token.word)) break;
    const lastAuxiliary = tokens[lastAuxiliaryIndex]?.word ?? '';
    const isPassive = BE_FORMS.has(lastAuxiliary) && !token.word.endsWith('ing');
    return { carriedIndex: index, isPassive, lastAuxiliaryIndex };
  }
  return { carriedIndex: undefined, isPassive: false, lastAuxiliaryIndex };
}

/**
 * Reports whether a word reads as an adverb standing between an auxiliary and the verb that it carries. A length
 * floor of five characters and an `ly` ending are the only markers, so the three exclusion sets are what keep
 * `apply`, `supply`, and their like out. The floor covers every shorter word, `ally` and `rely` among them.
 */
function isMannerAdverb(word: string): boolean {
  if (word.length <= 4 || !word.endsWith('ly')) return false;
  return !BARE_VERBS.has(word) && !IRREGULAR_PAST_VERBS.has(word) && !LY_FINAL_NON_ADVERBS.has(word);
}

/**
 * Returns the index of the verb carried by a chain where that verb closes a relative clause, or undefined where the
 * clause has no gap for the head noun to fill. A passive has promoted its own object, so it closes one only where
 * something else leaves a gap open; an intransitive verb closes one only where it strands a preposition.
 */
function closeOnCarriedVerb(tokens: readonly Token[], chain: AuxiliaryChain): number | undefined {
  const { carriedIndex, isPassive } = chain;
  if (carriedIndex === undefined) return undefined;
  if (isPassive && !hostsGap(tokens, carriedIndex)) return undefined;
  return closesCarriedClause(tokens, carriedIndex) ? carriedIndex : undefined;
}

/**
 * Reports whether a token carried by an auxiliary can close a relative clause. The carried path admits whatever is
 * not a function word, since a past participle carries no marker held by any lexicon here; an intransitive verb is
 * the one exception, and closes a clause only where it strands a preposition.
 */
function closesCarriedClause(tokens: readonly Token[], index: number): boolean {
  return !INTRANSITIVE_VERBS.has(tokens[index]?.word ?? '') || hasStrandedPreposition(tokens, index);
}

/**
 * Reports whether the token at `index`, reached by the scan rather than through an auxiliary, closes a relative
 * clause. {@link isFiniteVerb} decides that on the word alone; a word that it rejects is admitted back where a
 * stranded preposition gives the clause a gap, and an agentive participle is rejected whatever it says.
 */
function closesScannedClause(tokens: readonly Token[], index: number, kind: SubjectKind): boolean {
  if (kind === 'bare' && isAgentiveParticiple(tokens, index)) return false;
  return isFiniteVerb(tokens[index]?.word ?? '') || isStrandedVerb(tokens, index);
}

/**
 * Reports whether the token at `index` is a participle carrying an agentive `by`, which modifies the noun before it
 * rather than closing a clause. That noun is what the scan took for a bare subject, so the reading is the rulebook's
 * own passive-participle repair misread: admitting it reports a repaired site back as a defect. The test is held to
 * the bare shape, since a longer subject means the `by` is doing other work, as in `the clauses the author struck by
 * name`. An irregular participle needs a lexicon and has none here, no site in the corpus having called for one.
 */
function isAgentiveParticiple(tokens: readonly Token[], index: number): boolean {
  const word = tokens[index]?.word ?? '';
  if (word.length <= 3 || !word.endsWith('ed')) return false;
  const agent = tokens[index + 1];
  return agent !== undefined && !agent.afterBreak && agent.word === 'by';
}

/**
 * Reports whether a copula at `index` closes a relative clause, which is what a predicate-nominal gap turns on. A
 * copula takes no object, so only its position says whether the head fills its complement slot: one at the end of
 * its clause has an unfilled one, as in `the throwing mock it is`, and a trailing negator does not fill it either.
 */
function closesOnCopula(tokens: readonly Token[], index: number): boolean {
  if (isClauseFinal(tokens, index)) return true;
  const next = tokens[index + 1];
  return next !== undefined && !next.afterBreak && NEGATORS.has(next.word) && isClauseFinal(tokens, index + 1);
}

/**
 * Reports whether the token at `index` strands a preposition that ends its clause. This is what a subject holding a
 * prepositional phrase is held to: a window wide enough to reach past one is wide enough to reach the noun that ends
 * the sentence, and {@link isFiniteVerb} reads that noun as a verb. The stranded preposition is the one signature the
 * raised window is raised for, so a clause-final token without one closes nothing.
 */
function strandsClauseFinalPreposition(tokens: readonly Token[], index: number): boolean {
  return hasStrandedPreposition(tokens, index) && isClauseFinal(tokens, index + 1);
}

/** Reports whether the token at `index` ends its clause: nothing follows it, or what follows opens a new one. */
function isClauseFinal(tokens: readonly Token[], index: number): boolean {
  const next = tokens[index + 1];
  return next === undefined || next.afterBreak;
}

/**
 * Reports whether the token at `index` is a verb that a stranded preposition rescues. {@link isFiniteVerb} recognizes
 * a verb by morphology or by lexicon, and neither reaches a bare form such as `rest`; the stranded preposition is the
 * gap itself, so what precedes it needs only to be a word that can carry one. {@link hasStrandedPreposition} is what
 * keeps this from reaching a noun: a preposition with an object of its own strands nothing.
 */
function isStrandedVerb(tokens: readonly Token[], index: number): boolean {
  const word = tokens[index]?.word ?? '';
  if (word === '' || isFunctionWord(word) || S_FINAL_NON_VERBS.has(word)) return false;
  return hasStrandedPreposition(tokens, index);
}

/**
 * Reports whether the token at `index` hosts a gap that a head noun can fill. Three shapes do: a stranded
 * preposition, a `to` followed by a token that is not a function word, and a ditransitive participle, whose verb
 * promotes one object and leaves the other open. The second is looser than an infinitival test: It admits
 * `written to disk` along with `meant to convey`, and the agent adjudicates the difference.
 */
function hostsGap(tokens: readonly Token[], index: number): boolean {
  if (hasStrandedPreposition(tokens, index)) return true;
  if (DITRANSITIVE_PARTICIPLES.has(tokens[index]?.word ?? '')) return true;

  const marker = tokens[index + 1];
  if (marker === undefined || marker.afterBreak || marker.word !== 'to') return false;
  const complement = tokens[index + 2];
  return complement !== undefined && !complement.afterBreak && !isFunctionWord(complement.word);
}

/**
 * Reports whether the token at `index` strands a preposition: one sits directly after it, and nothing in the clause
 * fills that preposition's own object slot. What follows the preposition is what settles it, which is how `the store
 * the events belong to` is told from `the events belong to the store`.
 */
function hasStrandedPreposition(tokens: readonly Token[], index: number): boolean {
  const preposition = tokens[index + 1];
  if (preposition === undefined || preposition.afterBreak || !PREPOSITIONS.has(preposition.word)) return false;

  const next = tokens[index + 2];
  if (next === undefined || next.afterBreak) return true;
  if (DETERMINERS.has(next.word) || NUMERALS.has(next.word) || QUANTIFIERS.has(next.word)) return false;
  return !SUBJECT_PRONOUNS.has(next.word) && !OBJECT_PRONOUNS.has(next.word) && isFunctionWord(next.word);
}

/** Returns the sentence enclosing the span offsets `start` through `end`, flattened onto one line for the report. */
function findSentence(text: string, start: number, end: number): string {
  const boundary = /[.!?](?=\s|$)/g;
  let sentenceStart = 0;
  let match = boundary.exec(text);

  while (match !== null) {
    const stop = match.index + 1;
    if (stop >= end) break;
    if (stop <= start) sentenceStart = stop;
    match = boundary.exec(text);
  }

  const sentenceEnd = match === null ? text.length : Math.max(match.index + 1, end);
  return flattenWhitespace(text.slice(sentenceStart, sentenceEnd));
}

/**
 * Reports whether a word can be read as the finite verb of a relative clause. The test is loose by design: precision
 * belongs to the agent, and a test tight enough to reject every noun rejects the bare-noun and quantified shapes along
 * with them. An auxiliary or modal is excluded, since a relative clause's verb is a lexical one.
 */
function isFiniteVerb(word: string): boolean {
  if (isFunctionWord(word) || S_FINAL_NON_VERBS.has(word) || INTRANSITIVE_VERBS.has(word)) return false;
  if (BARE_VERBS.has(word) || IRREGULAR_PAST_VERBS.has(word)) return true;
  if (/(?:ize|ise|ify)$/.test(word)) return true;
  if (word.length > 3 && word.endsWith('ed')) return true;
  return word.length > 2 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word);
}

/** Reports whether a word belongs to a closed class, which disqualifies it as a head noun and as a finite verb. */
function isFunctionWord(word: string): boolean {
  return (
    AUXILIARIES.has(word) ||
    COORDINATORS.has(word) ||
    DETERMINERS.has(word) ||
    FOCUS_ADVERBS.has(word) ||
    NUMERALS.has(word) ||
    OBJECT_PRONOUNS.has(word) ||
    PREPOSITIONS.has(word) ||
    QUANTIFIERS.has(word) ||
    RELATIVIZERS.has(word) ||
    SUBJECT_PRONOUNS.has(word) ||
    SUBORDINATORS.has(word)
  );
}

/**
 * Reports whether `specifier` specifies `head` rather than being a noun itself. A determiner, a quantifier, and a
 * numeral all specify, which is the same set {@link SUBJECT_WINDOWS} keys its two-token minimum on: whatever opens an
 * embedded subject's noun phrase opens the head's own. Number agreement decides the rest, and is what tells `two
 * warnings` from the `2 carrying` that a preceding exit code and a participle put side by side.
 */
function isSpecifier(specifier: string, head: string): boolean {
  const requiresPluralHead =
    (NUMERALS.has(specifier) && specifier !== 'one') || PLURAL_SPECIFIERS.has(specifier) || /^\d+$/.test(specifier);
  if (requiresPluralHead) {
    return specifier !== '1' && isPluralNoun(head);
  }
  return DETERMINERS.has(specifier) || QUANTIFIERS.has(specifier) || NUMERALS.has(specifier);
}

/** Reports whether a word reads as a plural noun, which is the only marker carried by a bare-noun subject. */
function isPluralNoun(word: string): boolean {
  return (
    word.length > 3 &&
    word.endsWith('s') &&
    !/(?:ss|us|is)$/.test(word) &&
    !isFunctionWord(word) &&
    !S_FINAL_NON_VERBS.has(word)
  );
}

/**
 * Reports whether a head sits where a verb belongs rather than where a noun does. Three positions say so: after `to`,
 * which opens an infinitive; after an auxiliary or modal, optionally negated; and at the start of a clause, unless
 * the word is plural, since a bare singular noun does not open one.
 */
function isVerbPosition(tokens: readonly Token[], headIndex: number): boolean {
  const head = tokens[headIndex];
  if (head === undefined) return true;
  if (headIndex === 0 || head.afterBreak) return !isPluralNoun(head.word);

  const previous = tokens[headIndex - 1]?.word ?? '';
  const governor = NEGATORS.has(previous) ? (tokens[headIndex - 2]?.word ?? '') : previous;
  return governor === 'to' || AUXILIARIES.has(governor);
}

/** Splits a span into words, recording each word's offsets and whether clause punctuation precedes it. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let afterBreak = false;
  const pattern = /\S+/g;

  let match = pattern.exec(text);
  while (match !== null) {
    const chunk = match[0];
    const leading = chunk.length - chunk.replace(/^[^\p{L}\p{N}]+/u, '').length;
    const stripped = chunk.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
    const trailing = chunk.slice(leading + stripped.length);

    if (stripped === '') {
      afterBreak = true;
    } else {
      afterBreak ||= CLAUSE_BREAK_PATTERN.test(chunk.slice(0, leading));
      const start = match.index + leading;
      tokens.push({ raw: stripped, word: stripped.toLowerCase(), start, end: start + stripped.length, afterBreak });
      afterBreak = false;
      afterBreak ||= CLAUSE_BREAK_PATTERN.test(trailing);
    }
    match = pattern.exec(text);
  }

  return tokens;
}

// endregion | Helpers

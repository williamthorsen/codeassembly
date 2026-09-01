/**
 * Candidate detection for the revise-object-relatives sweep.
 *
 * The construction has no reliable surface form, so the anchor is adjacency rather than a verb pattern: a head noun
 * followed directly by the start of a new noun phrase, with no relativizer, preposition, conjunction, auxiliary, or
 * punctuation licensing the join. Three of the four shapes announce that new phrase with a closed-class word; the
 * bare-noun shape announces nothing, and is anchored on a plural subject instead.
 *
 * Detection is deliberately over-inclusive: precision is the agent's, which adjudicates each candidate with the
 * sentence in view. Three things are nonetheless decided here, because each is decidable without a reading. The
 * rulebook's two out-of-scope heads, the fused head and the adjunct relative, are rejected by head type. A word
 * carrying verbal morphology is read as a head noun only where a determiner makes it one, which is what keeps a main
 * clause and most participial phrases out. And a bare-noun subject is held to plural agreement.
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
 * Head nouns whose relative clause has an adjunct gap rather than an object gap. The rulebook puts these outside the
 * rule, since neither the passive participle nor the restored relativizer repairs one.
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
 * Verbs that take no object. A relative clause with an object gap needs a transitive verb, so one of these closing a
 * subject means the clause is the sentence's own rather than a relative.
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
 * {@link findCarriedVerbIndex} admits whatever an auxiliary carries.
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
 * Fused heads: a head that is its own relative pronoun. The rulebook puts these outside the rule, since the head is
 * not a lexical noun and no relativizer can be restored.
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
 * Auxiliaries that also serve as a clause's transitive main verb, which is what `the version the consumer has` turns
 * on. A `be` form is absent: a copula takes no object, so a clause it closes has no gap to find.
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

/** Relativizers. One between a head and a subject is the overt relativizer the rule asks for, so the site is clean. */
const RELATIVIZERS: ReadonlySet<string> = new Set(['that', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why']);

/** Subject pronouns opening the mildest shape. */
const SUBJECT_PRONOUNS: ReadonlySet<string> = new Set(['he', 'i', 'it', 'one', 'she', 'they', 'we', 'you']);

/**
 * The window each anchor's finite verb must fall in, counted in tokens from the subject's first word. A determiner,
 * a numeral, and a quantifier each specify a noun, so the verb may not sit directly on one; a pronoun subject is one
 * word, and so is a bare one, since nothing marks where a longer one would begin.
 */
const SUBJECT_WINDOWS: Readonly<Record<SubjectKind, { min: number; max: number }>> = {
  bare: { min: 1, max: 1 },
  determiner: { min: 2, max: 4 },
  numeral: { min: 2, max: 4 },
  pronoun: { min: 1, max: 1 },
  quantifier: { min: 2, max: 4 },
  'quantifier-pronoun': { min: 1, max: 1 },
};

/** What opens an embedded subject, which decides its window. Several kinds report under one shape. */
type SubjectKind = 'bare' | 'determiner' | 'numeral' | 'pronoun' | 'quantifier' | 'quantifier-pronoun';

/** The shape each anchor reports under, in the rulebook's own vocabulary. */
const SHAPES_BY_KIND: Readonly<Record<SubjectKind, SubjectShape>> = {
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

/** Counts the newlines preceding `offset`, which is how a span's own line maps to the line a candidate sits on. */
function countNewlinesBefore(text: string, offset: number): number {
  let count = 0;
  for (let index = 0; index < offset && index < text.length; index += 1) {
    if (text[index] === '\n') count += 1;
  }
  return count;
}

/**
 * Scans one span for every site that the construction may occupy. A later anchor whose head falls inside an accepted
 * phrase is that same site read from one word further in, so the scan resumes past the verb instead.
 */
function detectInSpan(span: ProseSpan): Candidate[] {
  const tokens = tokenize(span.text);
  const candidates: Candidate[] = [];
  let claimedThrough = -1;

  for (let index = 1; index < tokens.length; index += 1) {
    const headIndex = findHeadIndex(tokens, index);
    if (headIndex === undefined || headIndex <= claimedThrough) continue;

    const kind = classifySubject(tokens, index);
    if (kind === undefined) continue;
    if (kind === 'bare' && !isDeterminedPhrase(tokens, headIndex)) continue;

    const verbIndex = findVerbIndex(tokens, index, kind);
    if (verbIndex === undefined) continue;

    claimedThrough = verbIndex;
    const shape = SHAPES_BY_KIND[kind];
    candidates.push(buildCandidate({ span, tokens, headIndex, subjectIndex: index, verbIndex, shape }));
  }

  return candidates;
}

/**
 * Classifies what a token opens an embedded subject with, or reports undefined where it opens none. Four kinds are
 * read off closed classes; the bare kind has no marker, so a plural noun stands in for one.
 */
function classifySubject(tokens: readonly Token[], index: number): SubjectKind | undefined {
  const token = tokens[index];
  if (token === undefined) return undefined;
  const { word } = token;

  if (SUBJECT_PRONOUNS.has(word)) return 'pronoun';
  if (NUMERALS.has(word) || /^\d+$/.test(word)) return 'numeral';
  if (QUANTIFIER_PRONOUNS.has(word)) return 'quantifier-pronoun';
  if (QUANTIFIERS.has(word)) return 'quantifier';
  if (DETERMINERS.has(word)) return 'determiner';
  return isPluralNoun(word) ? 'bare' : undefined;
}

/** Collapses a phrase's own newlines and runs of spaces, so a wrapped site reads as one line in the report. */
function flattenWhitespace(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Returns the index of the head noun a subject at `subjectIndex` attaches to, or undefined where nothing there can be
 * one. A focus adverb may intervene; a licensing word, clause punctuation, a fused head, or an adjunct head cannot.
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
    if (isFunctionWord(head.word) || FUSED_HEADS.has(head.word) || ADJUNCT_HEADS.has(head.word)) return undefined;
    if (isVerbPosition(tokens, index)) return undefined;
    return isDeterminedHead(tokens, index) ? index : undefined;
  }
  return undefined;
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
 * plural agreement, which is the only reading its own form supports. An auxiliary carrying no lexical verb closes the
 * subject itself where it is a {@link MAIN_VERB_AUXILIARIES} member, since there a main-verb reading is what remains.
 */
function findVerbIndex(tokens: readonly Token[], subjectIndex: number, kind: SubjectKind): number | undefined {
  const window = SUBJECT_WINDOWS[kind];
  const first = subjectIndex + window.min;
  const last = Math.min(subjectIndex + window.max, tokens.length - 1);

  for (let index = subjectIndex + 1; index <= last; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.afterBreak) return undefined;
    if (COORDINATORS.has(token.word) || RELATIVIZERS.has(token.word)) return undefined;
    if (PREPOSITIONS.has(token.word) && token.word !== 'of') return undefined;
    if (AUXILIARIES.has(token.word) && index >= first) {
      const carried = findCarriedVerbIndex(tokens, index, last);
      if (carried !== undefined) return carried;
      if (!MAIN_VERB_AUXILIARIES.has(token.word)) continue;
      if (kind === 'bare' && !agreesWithPluralSubject(token.word)) return undefined;
      return index;
    }
    if (index < first || !isFiniteVerb(token.word)) continue;
    if (kind === 'bare' && !agreesWithPluralSubject(token.word)) return undefined;
    return index;
  }
  return undefined;
}

/**
 * Returns the index of the lexical verb an auxiliary at `auxiliaryIndex` carries, or undefined where it carries none
 * within `last`. A modal is always followed by a verb, which is what lets `the file the parser may read` be found
 * where the morphological test sees nothing on `read`; a second auxiliary or a negator between the two is skipped.
 */
function findCarriedVerbIndex(tokens: readonly Token[], auxiliaryIndex: number, last: number): number | undefined {
  for (let index = auxiliaryIndex + 1; index <= last; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.afterBreak) return undefined;
    if (AUXILIARIES.has(token.word) || NEGATORS.has(token.word)) continue;
    return isFunctionWord(token.word) ? undefined : index;
  }
  return undefined;
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

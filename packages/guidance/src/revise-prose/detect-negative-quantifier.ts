/**
 * Negative-quantifier detection.
 *
 * The construction is `no` used as a determiner, in any position: a verb's object ("publishes no build output"), after
 * an existential "there is" ("there's no Vercel CLI"), the subject of a relative clause ("a field that no test names"),
 * or a sentence's subject ("No file is written"). A `no` reads as a determiner when a word follows it without clause
 * punctuation between them, and that word neither ends a noun phrase, nor completes a fixed phrase such as `no longer`,
 * nor is a comparative that `than` follows.
 *
 * Detection is over-inclusive: Precision is the agent's, which adjudicates each candidate with the sentence in view.
 * A candidate is rejected here only where a reading cannot change the answer: a fixed phrase opened by `no`, the
 * pronoun `no one`, a hyphenated compound such as `no-op`, which the tokenizer reads as one word, and a `no` inside an
 * inline code span, which the extractor has masked. Each `no` is tagged with its position to point the agent at the
 * likeliest repair; the tag is a heuristic, and detection does not depend on it.
 */
import { countNewlinesBefore, findSentenceBounds, flattenWhitespace } from './span-text.ts';
import { AUXILIARIES, type Token, tokenize } from './tokenize-span.ts';
import type { NegativeQuantifierCandidate, NegativeQuantifierPosition, ProseSpan } from './types.ts';

/**
 * Scans every span for determiner `no`s, returning one candidate per sentence that contains at least one, in reading
 * order.
 */
export function detectNegativeQuantifiers(spans: readonly ProseSpan[]): NegativeQuantifierCandidate[] {
  return spans.flatMap(detectInSpan);
}

// region | Helpers

/**
 * Determiners that mark a later word as a head noun. `that` is left out, since it opens a relative or content clause as
 * often as it determines a noun.
 */
const DETERMINERS: ReadonlySet<string> = new Set([
  'a',
  'an',
  'any',
  'each',
  'every',
  'her',
  'his',
  'its',
  'my',
  'our',
  'some',
  'the',
  'their',
  'these',
  'this',
  'those',
  'your',
]);

/** Forms of *be* that open an existential clause after `there`. */
const BE_FORMS: ReadonlySet<string> = new Set(['are', 'be', 'been', 'being', 'is', 'was', 'were']);

/** Contractions that open an existential clause on their own: `there's no`. */
const EXISTENTIAL_CONTRACTIONS: ReadonlySet<string> = new Set(['there’re', 'there’s', "there're", "there's"]);

/** Most words that may stand between `there` and the `no` of its existential clause, as in "there will be no". */
const EXISTENTIAL_WINDOW = 3;

/** Words after `no` that complete a fixed phrase or a pronoun rather than open a noun phrase. */
const FIXED_FOLLOWERS: ReadonlySet<string> = new Set(['doubt', 'longer', 'matter', 'one', 'sooner']);

/**
 * Most words that may stand between a determiner and the head noun that it marks, when a relativizer follows the head.
 */
const MAX_HEAD_MODIFIERS = 2;

/** Most words that the noun phrase after `no` may contain before its verb. */
const MAX_SUBJECT_WORDS = 3;

/**
 * Words that end a noun phrase, whether the word after `no` or a later one: A verb of the relative never follows them.
 */
const PHRASE_BREAKERS: ReadonlySet<string> = new Set([
  'about',
  'after',
  'and',
  'as',
  'at',
  'before',
  'but',
  'by',
  'for',
  'from',
  'if',
  'in',
  'into',
  'nor',
  'on',
  'or',
  'so',
  'than',
  'that',
  'to',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'with',
  'without',
]);

/** Relativizers that may stand between the head noun and the `no` that opens the relative's subject. */
const RELATIVIZERS: ReadonlySet<string> = new Set(['that', 'which', 'who', 'whom']);

/** Classifies the position of the determiner `no` at `quantifierIndex`. */
function classifyPosition(tokens: readonly Token[], quantifierIndex: number): NegativeQuantifierPosition {
  if (isExistential(tokens, quantifierIndex)) return 'existential';

  const quantifier = tokens[quantifierIndex];
  const isRelative =
    quantifier !== undefined &&
    !quantifier.afterBreak &&
    findHeadIndex(tokens, quantifierIndex) !== undefined &&
    findVerbIndex(tokens, quantifierIndex) !== undefined;
  return isRelative ? 'relative' : 'other';
}

/**
 * Scans one span for every determiner `no`, grouping the ones that share a sentence into one candidate, since a rule
 * whose phrase is the sentence would otherwise report two candidates adjudicating the same text.
 */
function detectInSpan(span: ProseSpan): NegativeQuantifierCandidate[] {
  const tokens = tokenize(span.text);
  const candidates: NegativeQuantifierCandidate[] = [];
  let reportedSentenceStart = -1;

  for (const [quantifierIndex, token] of tokens.entries()) {
    if (token.word !== 'no' || !isDeterminer(tokens, quantifierIndex)) continue;

    const position = classifyPosition(tokens, quantifierIndex);
    const bounds = findSentenceBounds(span.text, token.start, token.end);
    const reported = candidates.at(-1);
    if (reported !== undefined && bounds.start === reportedSentenceStart) {
      reported.positions.push(position);
      continue;
    }
    reportedSentenceStart = bounds.start;

    const sentence = flattenWhitespace(span.text.slice(bounds.start, bounds.end));
    candidates.push({
      rule: 'negative-quantifier',
      file: span.file,
      line: span.line + countNewlinesBefore(span.text, bounds.start),
      phrase: sentence,
      sentence,
      positions: [position],
    });
  }

  return candidates;
}

/**
 * Returns the index of the head noun before a `no`: the word before the relativizer when one stands before the `no`,
 * the word before the `no` otherwise. A head needs a determiner before it, except a bare plural before a relativizer,
 * such as "notes that no domain declares". A word with a verb's ending needs its determiner directly before it, and
 * without a relativizer it is not read as a head at all: A `no` phrase after a verb or a participle is usually that
 * verb's object, as in "the prompt explains that no file exists" and "the merge publishes no change entries".
 */
function findHeadIndex(tokens: readonly Token[], quantifierIndex: number): number | undefined {
  const previous = tokens[quantifierIndex - 1];
  if (previous === undefined) return undefined;

  if (RELATIVIZERS.has(previous.word)) {
    const headIndex = quantifierIndex - 2;
    const modifiers = hasVerbEnding(tokens[headIndex]?.word ?? '') ? 0 : MAX_HEAD_MODIFIERS;
    const isHead = isDeterminedHead(tokens, headIndex, modifiers) || isBarePluralHead(tokens, headIndex);
    return isHead ? headIndex : undefined;
  }

  if (hasVerbEnding(previous.word)) return undefined;
  const headIndex = quantifierIndex - 1;
  return isDeterminedHead(tokens, headIndex, 0) ? headIndex : undefined;
}

/**
 * Returns the index of the finite verb that closes the noun phrase after a determiner `no`, or undefined if the phrase
 * is broken by punctuation or a function word, or runs past {@link MAX_SUBJECT_WORDS} without a verb.
 */
function findVerbIndex(tokens: readonly Token[], quantifierIndex: number): number | undefined {
  for (let index = quantifierIndex + 2; index <= quantifierIndex + 1 + MAX_SUBJECT_WORDS; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.afterBreak || PHRASE_BREAKERS.has(token.word)) return undefined;
    if (isFiniteVerb(token.word)) return index;
  }
  return undefined;
}

/** Reports whether a word ends as a finite verb or a participle does: in `-s`, `-ing`, or `-ed`. */
function hasVerbEnding(word: string): boolean {
  return /(?:ing|ed)$/.test(word) || (word.endsWith('s') && !/(?:ss|us|is)$/.test(word));
}

/**
 * Reports whether a word is a plural head noun without a determiner: an `-s` form that opens its phrase, after a
 * function word, a participle, or punctuation. A plural form after any other word is usually a verb, as in "the prompt
 * explains that no file exists".
 */
function isBarePluralHead(tokens: readonly Token[], headIndex: number): boolean {
  const head = tokens[headIndex];
  if (head === undefined || !head.word.endsWith('s') || /(?:ss|us|is)$/.test(head.word)) return false;
  if (isPhraseBreaker(head.word) || DETERMINERS.has(head.word)) return false;

  const previous = tokens[headIndex - 1];
  return previous === undefined || head.afterBreak || isPhraseBreaker(previous.word) || previous.word.endsWith('ing');
}

/**
 * Reports whether a word is a head noun that a determiner marks, directly or across at most `modifiers` words, without
 * punctuation between them.
 */
function isDeterminedHead(tokens: readonly Token[], headIndex: number, modifiers: number): boolean {
  const head = tokens[headIndex];
  if (head === undefined || head.afterBreak || isPhraseBreaker(head.word) || DETERMINERS.has(head.word)) return false;

  for (let index = headIndex - 1; index >= Math.max(0, headIndex - 1 - modifiers); index -= 1) {
    const token = tokens[index];
    if (token === undefined || isPhraseBreaker(token.word)) return false;
    if (DETERMINERS.has(token.word)) return true;
    if (token.afterBreak) return false;
  }
  return false;
}

/**
 * Reports whether the `no` at `quantifierIndex` is a determiner: A word follows it without clause punctuation between
 * them, and that word opens a noun phrase rather than ending one or completing a fixed phrase.
 */
function isDeterminer(tokens: readonly Token[], quantifierIndex: number): boolean {
  const next = tokens[quantifierIndex + 1];
  if (next === undefined || next.afterBreak || isPhraseBreaker(next.word) || FIXED_FOLLOWERS.has(next.word)) {
    return false;
  }
  // A word that `than` follows is a comparative that `no` modifies: `no more than`, `no stronger than`.
  return tokens[quantifierIndex + 2]?.word !== 'than';
}

/**
 * Reports whether the `no` at `quantifierIndex` follows an existential clause's verb: a form of *be* directly before
 * it, with `there` at most {@link EXISTENTIAL_WINDOW} words back, or a contraction such as `there's` directly before it.
 */
function isExistential(tokens: readonly Token[], quantifierIndex: number): boolean {
  const previous = tokens[quantifierIndex - 1];
  if (previous === undefined) return false;
  if (EXISTENTIAL_CONTRACTIONS.has(previous.word)) return true;
  if (!BE_FORMS.has(previous.word)) return false;

  return tokens
    .slice(Math.max(0, quantifierIndex - EXISTENTIAL_WINDOW), quantifierIndex - 1)
    .some((token) => token.word === 'there');
}

/** Reports whether a word reads as the finite verb of a relative clause: an auxiliary, a modal, or an `-s` form. */
function isFiniteVerb(word: string): boolean {
  if (AUXILIARIES.has(word)) return true;
  return word.length > 2 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word) && !isPhraseBreaker(word);
}

/** Reports whether a word ends a noun phrase, as a function word or an auxiliary does. */
function isPhraseBreaker(word: string): boolean {
  return PHRASE_BREAKERS.has(word) || AUXILIARIES.has(word);
}

// endregion | Helpers

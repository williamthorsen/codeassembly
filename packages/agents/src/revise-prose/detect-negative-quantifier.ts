/**
 * Negative-quantifier detection.
 *
 * The construction is a relative clause whose subject is a noun phrase opened by `no`: "a condition that no user could
 * observe". The anchor is the `no`, read against a determined head noun before it, with or without a relativizer
 * between them, and a finite verb within a few words after it. A finite verb is an auxiliary or modal, or a word ending
 * in `-s` after the noun phrase's first word.
 *
 * Detection is over-inclusive: Precision is the agent's, which adjudicates each candidate with the sentence in view.
 * A candidate is rejected here only where a reading cannot change the answer: a fixed phrase opened by `no`, and a `no`
 * inside an inline code span, which the extractor has masked. The finite-verb test misses a past-tense verb ("a file
 * that no reader opened") and a plural subject's present-tense verb ("errors that no tests catch"), and a singular
 * head without a determiner before it is not read as one; the calibration's shape covers what the detector misses.
 */
import { CODE_SPAN_PLACEHOLDER, CODE_SPAN_PLACEHOLDER_WORD } from './mask-code-spans.ts';
import { countNewlinesBefore, findSentence, flattenWhitespace } from './span-text.ts';
import { AUXILIARIES, type Token, tokenize } from './tokenize-span.ts';
import type { NegativeQuantifierCandidate, ProseSpan } from './types.ts';

/** Scans every span for the construction, returning one candidate per site in reading order. */
export function detectNegativeQuantifiers(spans: readonly ProseSpan[]): NegativeQuantifierCandidate[] {
  return spans.flatMap(detectInSpan);
}

// region | Helpers

/**
 * Determiners that mark a later word as a head noun. `that` is left out, since it opens a relative or content clause as often as it determines a noun.
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

/** Words after `no` that complete a fixed phrase rather than open a subject: `no longer`, `no one`, and the rest. */
const FIXED_FOLLOWERS: ReadonlySet<string> = new Set(['longer', 'more', 'one', 'other', 'such']);

/** Most words that may stand between a determiner and the head noun that it marks, when a relativizer follows the head. */
const MAX_HEAD_MODIFIERS = 2;

/** Most words that the noun phrase after `no` may contain before its verb. */
const MAX_SUBJECT_WORDS = 3;

/** Words that end a noun phrase, whether the word after `no` or a later one: No verb of the relative follows them. */
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

/** Builds one candidate from a resolved head, `no`, and verb, reading its sentence out of the span. */
function buildCandidate(input: {
  span: ProseSpan;
  tokens: readonly Token[];
  headIndex: number;
  quantifierIndex: number;
  verbIndex: number;
}): NegativeQuantifierCandidate {
  const { span, tokens, headIndex, quantifierIndex, verbIndex } = input;
  const head = tokens[headIndex];
  const verb = tokens[verbIndex];
  if (head === undefined || verb === undefined) throw new Error('candidate resolved outside its token run');

  // A token's `raw` has its delimiters stripped, which would report the placeholder as an ordinary word.
  const subject = tokens
    .slice(quantifierIndex + 1, verbIndex)
    .map((token) => (token.word === CODE_SPAN_PLACEHOLDER_WORD ? CODE_SPAN_PLACEHOLDER : token.raw))
    .join(' ');

  return {
    rule: 'negative-quantifier',
    file: span.file,
    line: span.line + countNewlinesBefore(span.text, head.start),
    head: head.raw,
    subject,
    verb: verb.raw,
    phrase: flattenWhitespace(span.text.slice(head.start, verb.end)),
    sentence: findSentence(span.text, head.start, verb.end),
  };
}

/** Scans one span for every `no` that opens the subject of a relative clause on a determined head. */
function detectInSpan(span: ProseSpan): NegativeQuantifierCandidate[] {
  const tokens = tokenize(span.text);
  const candidates: NegativeQuantifierCandidate[] = [];

  for (const [quantifierIndex, token] of tokens.entries()) {
    if (token.word !== 'no' || token.afterBreak) continue;

    const headIndex = findHeadIndex(tokens, quantifierIndex);
    if (headIndex === undefined) continue;

    const verbIndex = findVerbIndex(tokens, quantifierIndex);
    if (verbIndex === undefined) continue;

    candidates.push(buildCandidate({ span, tokens, headIndex, quantifierIndex, verbIndex }));
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

  const headIndex = quantifierIndex - 1;
  if (hasVerbEnding(previous.word)) return undefined;
  return isDeterminedHead(tokens, headIndex, 0) ? headIndex : undefined;
}

/**
 * Returns the index of the finite verb that closes the noun phrase after a `no`, or undefined if the phrase is a fixed
 * one, is broken by punctuation or a function word, or runs past {@link MAX_SUBJECT_WORDS} without a verb.
 */
function findVerbIndex(tokens: readonly Token[], quantifierIndex: number): number | undefined {
  const first = tokens[quantifierIndex + 1];
  if (first === undefined || first.afterBreak || FIXED_FOLLOWERS.has(first.word) || isPhraseBreaker(first.word)) {
    return undefined;
  }

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
 * Reports whether a word is a plural head noun with no determiner: an `-s` form that opens its phrase, after a
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
 * Reports whether a word is a head noun that a determiner marks, directly or across at most `modifiers` words, with no
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

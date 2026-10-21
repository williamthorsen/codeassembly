import { CODE_SPAN_PLACEHOLDER_WORD } from './mask-code-spans.ts';
import { isFiniteVerb, isFunctionWord, isPluralNoun } from './object-relative-predicates.ts';
import {
  ADJUNCT_HEADS,
  COMPARATIVE_ADJECTIVES,
  DEGREE_ADVERBIALS,
  DEMONSTRATIVES,
  DETERMINERS,
  FOCUS_ADVERBS,
  FUSED_HEADS,
  FUSING_QUANTIFIERS,
  NEGATORS,
  NON_HEAD_MODIFIERS,
  NUMERALS,
  PLURAL_SPECIFIERS,
  PRO_FORM_HEADS,
  QUANTIFIER_PRONOUNS,
  QUANTIFIERS,
  SUBJECT_PRONOUNS,
  WH_MARKERS,
} from './object-relative-words.ts';
import { AUXILIARIES, type Token } from './tokenize-span.ts';
import type { SubjectKind } from './types.ts';

/**
 * Classifies what a token opens an embedded subject with, or reports undefined if it opens none. Five kinds are
 * read off closed classes; the bare kind doesn't have a marker, so a plural noun stands in for one. A demonstrative is
 * tested ahead of the determiner to which it also belongs, since it alone of the determiners stands as a subject by
 * itself.
 */
export function classifySubject(tokens: readonly Token[], index: number): SubjectKind | undefined {
  const token = tokens[index];
  if (token === undefined) return undefined;
  const { word } = token;

  if (word === CODE_SPAN_PLACEHOLDER_WORD) return undefined;
  if (SUBJECT_PRONOUNS.has(word)) return closesComparativePhrase(tokens, index) ? undefined : 'pronoun';
  if (isNumeral(word)) return 'numeral';
  if (QUANTIFIER_PRONOUNS.has(word)) return 'quantifier-pronoun';
  if (QUANTIFIERS.has(word)) return opensDegreeAdverbial(tokens, index) ? undefined : 'quantifier';
  if (DEMONSTRATIVES.has(word)) return 'demonstrative';
  if (DETERMINERS.has(word)) return 'determiner';
  return isPluralNoun(word) ? 'bare' : undefined;
}

/**
 * Returns the index of the head noun to which a subject at `subjectIndex` attaches, or undefined if nothing there can
 * be one. A focus adverb may intervene; a licensing word, clause punctuation, a fused head, an adjunct head, or a
 * modifier without a noun reading cannot, and neither can a wh-word, which doesn't head a noun phrase. A pro-form
 * head is admitted ahead of those tests, since the numeral reading of `one` and the verbal reading of `ones` would
 * each reject it.
 */
export function findHeadIndex(tokens: readonly Token[], subjectIndex: number): number | undefined {
  let index = subjectIndex;
  while (index > 0) {
    const candidate = tokens[index];
    if (candidate === undefined || candidate.afterBreak) return undefined;
    index -= 1;
    const head = tokens[index];
    if (head === undefined) return undefined;
    if (head.word === CODE_SPAN_PLACEHOLDER_WORD) return undefined;
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
 * Reports whether a specifier opens the phrase a head at `headIndex` closes, allowing one modifier between the two.
 * A bare-noun subject doesn't have a marker of its own, so this is what keeps a plain `Noun Nouns Verb` main clause
 * from reading as a relative clause.
 */
export function isDeterminedPhrase(tokens: readonly Token[], headIndex: number): boolean {
  for (let index = headIndex - 1; index >= 0 && index >= headIndex - 2; index -= 1) {
    const token = tokens[index];
    if (token === undefined) return false;
    if (isSpecifier(token.word, tokens[headIndex]?.word ?? '')) return true;
    if (tokens[index + 1]?.afterBreak === true) return false;
  }
  return false;
}

/**
 * Reports whether the quantifier at `index` opens an adverbial rather than a noun phrase. `the entries the sweep no
 * longer holds` contains such a pair, and reading it as a subject gives the site a second anchor whose head is the
 * site's own subject.
 */
export function opensDegreeAdverbial(tokens: readonly Token[], index: number): boolean {
  const next = tokens[index + 1];
  if (next === undefined || next.afterBreak) return false;
  return DEGREE_ADVERBIALS.has(`${tokens[index]?.word ?? ''} ${next.word}`);
}

// region | Helpers

/**
 * Reports whether the token at `index` closes a noun phrase opened by a comparative adjective, which makes it that
 * phrase's head rather than a subject: `an older one` in `a key an older one ignores`. Reading it as a subject gives
 * the site a second anchor whose head is the adjective, and {@link PRO_FORM_HEADS} reads the same word as a head in
 * that position, so the two treatments agree.
 */
function closesComparativePhrase(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index];
  if (token === undefined || token.afterBreak) return false;
  if (!PRO_FORM_HEADS.has(token.word)) return false;
  return COMPARATIVE_ADJECTIVES.has(tokens[index - 1]?.word ?? '');
}

/**
 * Reports whether a word with verbal morphology is nonetheless heading a noun phrase, which a specifier before it
 * settles. Without one, an `-s` form is the clause's own verb and an `-ing` form is a participle, so reading
 * either as a head noun misreads a whole clause as a relative.
 */
function isDeterminedHead(tokens: readonly Token[], headIndex: number): boolean {
  const head = tokens[headIndex];
  if (head === undefined) return false;
  if (!isFiniteVerb(head.word) && !head.word.endsWith('ing')) return true;
  if (head.afterBreak || headIndex === 0) return false;
  return isSpecifier(tokens[headIndex - 1]?.word ?? '', head.word);
}

/**
 * Reports whether a pro-form head at `headIndex` fuses with the quantifier before it, as `no one` does. A fused
 * reading is its own relative pronoun and doesn't take a relativizer, so the rule leaves it alone.
 */
function isFusedProForm(tokens: readonly Token[], headIndex: number): boolean {
  if (headIndex === 0 || tokens[headIndex]?.afterBreak === true) return false;
  return FUSING_QUANTIFIERS.has(tokens[headIndex - 1]?.word ?? '');
}

/** Reports whether a word is a numeral, spelled or in digits. */
function isNumeral(word: string): boolean {
  return NUMERALS.has(word) || /^\d+$/.test(word);
}

/**
 * Reports whether `specifier` specifies `head` rather than being a noun itself. A determiner, a quantifier, and a
 * numeral all specify, which is the same set on which {@link SUBJECT_WINDOWS} keys its two-token minimum: Whatever
 * opens an embedded subject's noun phrase opens the head's own. Number agreement decides the rest, and is what tells
 * `two warnings` from the `2 carrying` that a preceding exit code and a participle put side by side.
 */
function isSpecifier(specifier: string, head: string): boolean {
  const requiresPluralHead =
    (NUMERALS.has(specifier) && specifier !== 'one') || PLURAL_SPECIFIERS.has(specifier) || /^\d+$/.test(specifier);
  if (requiresPluralHead) {
    return specifier !== '1' && isPluralNoun(head);
  }
  return DETERMINERS.has(specifier) || QUANTIFIERS.has(specifier) || NUMERALS.has(specifier);
}

/**
 * Reports whether a head is where a verb belongs rather than where a noun does. Three positions say so: after `to`,
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

/**
 * Reports whether a wh-word opens the phrase that the token at `headIndex` heads. A fronted wh-phrase binds the gap
 * after it, so a relativizer cannot be restored and the rule governs nothing there: `how big the problem is`, `whose
 * call it is`, and `how many files the parser reads` are questions rather than heads with gaps.
 *
 * The walk crosses a quantifier or a numeral, which stays inside the wh-phrase, and stops at a determiner, which
 * opens a phrase of its own. That is what leaves a genuine site nested in a wh-clause alone, as in `how the source it
 * names got stale`. A wh-word two or more tokens out with a determiner between, as in `what kind of content it is`,
 * is out of reach: Reaching it needs a clause-level test, which would reject the nested sites too.
 */
function isWhMarkedHead(tokens: readonly Token[], headIndex: number): boolean {
  for (let index = headIndex - 1; index >= 0; index -= 1) {
    const following = tokens[index + 1];
    if (following === undefined || following.afterBreak) return false;
    const word = tokens[index]?.word ?? '';
    if (WH_MARKERS.has(word)) return true;
    if (!QUANTIFIERS.has(word) && !isNumeral(word)) return false;
  }
  return false;
}

// endregion | Helpers

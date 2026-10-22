import {
  BARE_VERBS,
  BE_FORMS,
  DITRANSITIVE_PARTICIPLES,
  INTRANSITIVE_VERBS,
  IRREGULAR_PAST_VERBS,
  S_FINAL_NON_VERBS,
} from './object-relative-verbs.ts';
import {
  CARRIED_VERB_WINDOW,
  COORDINATORS,
  DETERMINERS,
  FOCUS_ADVERBS,
  LY_FINAL_NON_ADVERBS,
  NEGATORS,
  NUMERALS,
  OBJECT_PRONOUNS,
  PREPOSITIONS,
  QUANTIFIERS,
  RELATIVIZERS,
  SUBJECT_PRONOUNS,
  SUBORDINATORS,
} from './object-relative-words.ts';
import { AUXILIARIES, type Token } from './tokenize-span.ts';
import type { SubjectKind } from './types.ts';

/** The auxiliary chain opening at one auxiliary: what it carries, how that reads, and where the chain ends. */
export interface AuxiliaryChain {
  /** Index of the lexical verb carried by the chain, or undefined if it carries none. */
  carriedIndex: number | undefined;
  /** Whether the chain's last auxiliary is a `be` form carrying something other than an `-ing` form. */
  isPassive: boolean;
  /** Index of the chain's last auxiliary, which is the clause's main verb when the chain carries none. */
  lastAuxiliaryIndex: number;
}

/**
 * Returns the index of the verb carried by a chain when that verb closes a relative clause, or undefined if the
 * clause doesn't have a gap for the head noun to fill. A passive has promoted its own object, so it closes one only
 * when something else leaves a gap open; an intransitive verb closes one only when it strands a preposition.
 */
export function closeOnCarriedVerb(tokens: readonly Token[], chain: AuxiliaryChain): number | undefined {
  const { carriedIndex, isPassive } = chain;
  if (carriedIndex === undefined) return undefined;
  if (isPassive && !hostsGap(tokens, carriedIndex)) return undefined;
  return closesCarriedClause(tokens, carriedIndex) ? carriedIndex : undefined;
}

/**
 * Reports whether a copula at `index` closes a relative clause, which is what a predicate-nominal gap turns on. A
 * copula doesn't take an object, so only its position says whether the head fills its complement slot: One at the
 * end of its clause has an unfilled one, as in `the throwing mock it is`, and a trailing negator does not fill it
 * either.
 */
export function closesOnCopula(tokens: readonly Token[], index: number): boolean {
  if (isClauseFinal(tokens, index)) return true;
  const next = tokens[index + 1];
  return next !== undefined && !next.afterBreak && NEGATORS.has(next.word) && isClauseFinal(tokens, index + 1);
}

/**
 * Reports whether the token at `index`, reached by the scan rather than through an auxiliary, closes a relative
 * clause. {@link isFiniteVerb} decides that on the word alone; a word that it rejects is admitted back when a
 * stranded preposition gives the clause a gap, and an agentive participle is rejected whatever it says.
 */
export function closesScannedClause(tokens: readonly Token[], index: number, kind: SubjectKind): boolean {
  if (kind === 'bare' && isAgentiveParticiple(tokens, index)) return false;
  return isFiniteVerb(tokens[index]?.word ?? '') || isStrandedVerb(tokens, index);
}

/**
 * Reports whether a word can be read as the finite verb of a relative clause. The test is loose by design: Precision
 * belongs to the agent, and a test tight enough to reject every noun rejects the bare-noun and quantified shapes along
 * with them. An auxiliary or modal is excluded, since a relative clause's verb is a lexical one.
 */
export function isFiniteVerb(word: string): boolean {
  if (isFunctionWord(word) || S_FINAL_NON_VERBS.has(word) || INTRANSITIVE_VERBS.has(word)) return false;
  if (BARE_VERBS.has(word) || IRREGULAR_PAST_VERBS.has(word)) return true;
  if (/(?:ize|ise|ify)$/.test(word)) return true;
  if (word.length > 3 && word.endsWith('ed')) return true;
  return word.length > 2 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word);
}

/** Reports whether a word belongs to a closed class, which disqualifies it as a head noun and as a finite verb. */
export function isFunctionWord(word: string): boolean {
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
 * Reports whether a word reads as an adverb standing between an auxiliary and the verb that it carries. A length
 * floor of five characters and an `ly` ending are the only markers, so the three exclusion sets are what keep
 * `apply`, `supply`, and their like out. The floor covers every shorter word, `ally` and `rely` among them.
 */
export function isMannerAdverb(word: string): boolean {
  if (word.length <= 4 || !word.endsWith('ly')) return false;
  return !BARE_VERBS.has(word) && !IRREGULAR_PAST_VERBS.has(word) && !LY_FINAL_NON_ADVERBS.has(word);
}

/** Reports whether a word reads as a plural noun, which is the only marker that a bare-noun subject has. */
export function isPluralNoun(word: string): boolean {
  return (
    word.length > 3 &&
    word.endsWith('s') &&
    !/(?:ss|us|is)$/.test(word) &&
    !isFunctionWord(word) &&
    !S_FINAL_NON_VERBS.has(word)
  );
}

/**
 * Resolves the auxiliary chain opening at `auxiliaryIndex`: the lexical verb that it carries within
 * {@link CARRIED_VERB_WINDOW}, how that verb reads, and which auxiliary ends the chain. A modal is always followed by
 * a verb, which is what lets `the file the parser may read` be found even though the morphological test sees nothing
 * on `read`; a further auxiliary, a negator, and an adverb between the two are skipped.
 *
 * The voice is read off the chain's last auxiliary rather than its first, so `has been approved` is passive, whereas
 * `has approved` is active. A `be` form carrying an `-ing` form is progressive, which leaves the object gap open.
 */
export function resolveAuxiliaryChain(tokens: readonly Token[], auxiliaryIndex: number): AuxiliaryChain {
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
 * Reports whether the token at `index` strands a preposition that ends its clause. This is what a subject containing a
 * prepositional phrase is held to: A window wide enough to reach past one is wide enough to reach the noun that ends
 * the sentence, and {@link isFiniteVerb} reads that noun as a verb. The stranded preposition is the one signature for
 * which the raised window is raised, so a clause-final token without one closes nothing.
 */
export function strandsClauseFinalPreposition(tokens: readonly Token[], index: number): boolean {
  return hasStrandedPreposition(tokens, index) && isClauseFinal(tokens, index + 1);
}

// region | Helpers

/**
 * Reports whether a token carried by an auxiliary can close a relative clause. The carried path admits whatever is
 * not a function word, since the lexicons here do not list a past-participle marker; an intransitive verb is the one
 * exception, and closes a clause only when it strands a preposition.
 */
function closesCarriedClause(tokens: readonly Token[], index: number): boolean {
  return !INTRANSITIVE_VERBS.has(tokens[index]?.word ?? '') || hasStrandedPreposition(tokens, index);
}

/**
 * Reports whether the token at `index` strands a preposition: One directly follows it, and nothing in the clause
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
 * Reports whether the token at `index` is a participle followed by an agentive `by`, which modifies the noun before it
 * rather than closing a clause. That noun is what the scan took for a bare subject, so the reading is the rulebook's
 * own passive-participle repair misread: Admitting it reports a repaired site back as a defect. The test is held to
 * the bare shape, since a longer subject means the `by` is doing other work, as in `the clauses the author struck by
 * name`. An irregular participle needs a lexicon and has none here, since the corpus has not had a site calling for
 * one.
 */
function isAgentiveParticiple(tokens: readonly Token[], index: number): boolean {
  const word = tokens[index]?.word ?? '';
  if (word.length <= 3 || !word.endsWith('ed')) return false;
  const agent = tokens[index + 1];
  return agent !== undefined && !agent.afterBreak && agent.word === 'by';
}

/** Reports whether the token at `index` ends its clause: Nothing follows it, or what follows opens a new one. */
function isClauseFinal(tokens: readonly Token[], index: number): boolean {
  const next = tokens[index + 1];
  return next === undefined || next.afterBreak;
}

/**
 * Reports whether the token at `index` is a verb that a stranded preposition rescues. {@link isFiniteVerb} recognizes
 * a verb by morphology or by lexicon, and neither reaches a bare form such as `rest`; the stranded preposition is the
 * gap itself, so what precedes it needs only to be a word that can have one. {@link hasStrandedPreposition} is what
 * keeps this from reaching a noun: A preposition with an object of its own strands nothing.
 */
function isStrandedVerb(tokens: readonly Token[], index: number): boolean {
  const word = tokens[index]?.word ?? '';
  if (word === '' || isFunctionWord(word) || S_FINAL_NON_VERBS.has(word)) return false;
  return hasStrandedPreposition(tokens, index);
}

// endregion | Helpers

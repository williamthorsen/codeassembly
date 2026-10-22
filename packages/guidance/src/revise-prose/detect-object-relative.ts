/**
 * Reduced-object-relative detection.
 *
 * The construction doesn't have a reliable surface form, so the anchor is adjacency rather than a verb pattern: a head
 * noun followed directly by the start of a new noun phrase, without any relativizer, preposition, conjunction,
 * auxiliary, or punctuation licensing the join. Three of the four shapes open that new phrase with a closed-class
 * word; the bare-noun shape does not, and is anchored on a plural subject instead.
 *
 * Detection is over-inclusive: Precision is the agent's, which adjudicates each candidate with the sentence in view.
 * A candidate is rejected here only when a reading cannot change the answer, and each test documents the reason for
 * its own rejection.
 *
 * An inline code span reads as one placeholder token, which doesn't head a phrase, open a subject, or close a
 * clause. Because it still occupies its slot, a site that a code span interrupts stays reachable.
 */
import { classifySubject, findHeadIndex, isDeterminedPhrase } from './find-object-relative-head.ts';
import { CODE_SPAN_PLACEHOLDER, CODE_SPAN_PLACEHOLDER_WORD } from './mask-code-spans.ts';
import {
  closeOnCarriedVerb,
  closesOnCopula,
  closesScannedClause,
  isMannerAdverb,
  isPluralNoun,
  resolveAuxiliaryChain,
  strandsClauseFinalPreposition,
} from './object-relative-predicates.ts';
import { BE_FORMS, MAIN_VERB_AUXILIARIES } from './object-relative-verbs.ts';
import {
  COORDINATORS,
  EXTENDED_SUBJECT_WINDOW,
  FOCUS_ADVERBS,
  NEGATORS,
  PREPOSITIONS,
  RELATIVIZERS,
  SHAPES_BY_KIND,
  SUBJECT_WINDOWS,
} from './object-relative-words.ts';
import { countNewlinesBefore, findSentence, flattenWhitespace } from './span-text.ts';
import { AUXILIARIES, type Token, tokenize } from './tokenize-span.ts';
import type { ObjectRelativeCandidate, ProseSpan, SubjectKind, SubjectShape } from './types.ts';

/** Scans every span for the construction, returning one candidate per site in reading order. */
export function detectObjectRelatives(spans: readonly ProseSpan[]): ObjectRelativeCandidate[] {
  const candidates: ObjectRelativeCandidate[] = [];
  for (const span of spans) {
    candidates.push(...detectInSpan(span));
  }
  return candidates;
}

// region | Helpers

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
}): ObjectRelativeCandidate {
  const { span, tokens, headIndex, subjectIndex, verbIndex, shape } = input;
  const head = tokens[headIndex];
  const verb = tokens[verbIndex];
  if (head === undefined || verb === undefined) throw new Error('candidate resolved outside its token run');

  // A token's `raw` has its delimiters stripped, which would report the placeholder as an ordinary word.
  const subject = tokens
    .slice(subjectIndex, verbIndex)
    .map((token) => (token.word === CODE_SPAN_PLACEHOLDER_WORD ? CODE_SPAN_PLACEHOLDER : token.raw))
    .join(' ');

  return {
    rule: 'reduced-object-relative',
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
 * Scans one span for every site that the construction may occupy. A later anchor whose head falls inside an accepted
 * phrase is that same site read from one word further in: When it closes on the same verb, it replaces the reading
 * before it, the nearer head being the tighter one, and when it closes elsewhere, it is dropped. A distant head can
 * reach a verb across a crossed preposition, so first found is not the reading to keep.
 *
 * The nearer head is the sounder one only when every competing anchor opens a real subject, which is what
 * {@link opensDegreeAdverbial} secures: An anchor whose subject is adverbial takes the site's own subject as its
 * head, and would be kept only for being nearest.
 */
function detectInSpan(span: ProseSpan): ObjectRelativeCandidate[] {
  const tokens = tokenize(span.text);
  const candidates: ObjectRelativeCandidate[] = [];
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
 * Returns the index of the finite verb closing a subject that opens at `subjectIndex`, or undefined if none falls
 * within that kind's window. The scan stops at anything that ends the noun phrase: a coordinator, a relativizer, and
 * every preposition but `of`, which a partitive such as `two of them` needs. A bare subject is additionally held to
 * plural agreement, which is the only reading its own form supports. A chain without a lexical verb closes the
 * subject on its last auxiliary when that is a {@link MAIN_VERB_AUXILIARIES} member, since a main-verb reading is
 * what remains: `the file the producer does not have` closes on `have`. A chain ending in a `be` form closes on that
 * form instead, when {@link closesOnCopula} holds, so `the version the consumer has been` closes on `been`.
 *
 * An auxiliary chain that the clause fails is the end of the subject rather than a token to scan past. Continuing
 * would let the morphological test reach the same participle a second time and report what the chain just rejected.
 *
 * A preposition other than `of` opens a phrase inside the subject rather than ending it, and raises the ceiling to
 * {@link EXTENDED_SUBJECT_WINDOW} so that a subject containing one is still reachable. Precision then passes from the
 * window to {@link strandsClauseFinalPreposition}: Past a crossed preposition only a verb stranding a clause-final
 * preposition closes the clause, which is what tells the `lives` of `the sources this prose about the idioms lives
 * in` from the `idioms` before it. A direct-object gap behind such a subject is out of reach; that is the tradeoff
 * of a window this wide.
 *
 * An adverb or a negator between the subject and the verb raises the ceiling by one rather than spending a token of
 * it, mirroring what {@link resolveAuxiliaryChain} reads through, so `the source it also names` reports as `the
 * source it names` does.
 *
 * A demonstrative standing alone closes on the token beside it, but not on one reading as a plural noun:
 * {@link isFiniteVerb} cannot tell that from a verb, and the noun that a demonstrative specifies is the likelier
 * reading.
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
    // The scan reads through the placeholder, which is what leaves the verb of a subject containing a code span in
    // reach. It keeps its window slot, since it stands where a word of the subject stood.
    if (token.word === CODE_SPAN_PLACEHOLDER_WORD) continue;

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
 * Resolves the shape under which an anchor reports. Every kind but the demonstrative has one of its own; a
 * demonstrative reports as a pronoun when it stands alone as the subject and as a definite noun phrase when it
 * specifies a noun. What separates the two is whether the scan crossed a noun rather than how far the verb sits,
 * since {@link skipsAsModifier} moves the verb one token further for every adverb that it reads through.
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
 * being a modifier that the scan read through.
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
 * ends the search, since the chain that it failed is the end of the subject; a chain carrying none closes on its last
 * auxiliary when that reads as the clause's own verb, either as a copula at the end of its clause or as a main-verb
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
 * a verb disagrees with in number ends the search, since that subject doesn't have any other reading; everything
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

// endregion | Helpers

/**
 * Overused-word detection.
 *
 * The plain-speech calibration lists words that recur in uses for which a word naming the relation exists, and keeps
 * some senses of several of them. Only a reading tells a kept sense from a candidate, so the detector reports every
 * sentence containing a listed word or one of its inflections and leaves the sense to the adjudicator. The one sense
 * skipped here is "stand in for", a fixed phrase whose reading cannot change the answer.
 */
import { countNewlinesBefore, findCodeSpans, findSentenceBounds, flattenWhitespace } from './span-text.ts';
import type { OverusedWordCandidate, ProseSpan } from './types.ts';

/**
 * Every watchlist word, mapped to its inflections. A content test holds the keys equal to the calibration's "Words to
 * look for" list.
 */
export const OVERUSED_WORDS: ReadonlyMap<string, readonly string[]> = new Map([
  ['carry', ['carries', 'carried', 'carrying']],
  ['cost', ['costs', 'costing']],
  ['hold', ['holds', 'held', 'holding']],
  ['land', ['lands', 'landed', 'landing']],
  ['reach', ['reaches', 'reached', 'reaching']],
  ['route', ['routes', 'routed', 'routing']],
  ['ship', ['ships', 'shipped', 'shipping']],
  ['sit', ['sits', 'sat', 'sitting']],
  ['stand', ['stands', 'stood', 'standing']],
  ['surface', ['surfaces', 'surfaced', 'surfacing']],
]);

/**
 * Scans every span for watchlist words, returning one candidate per sentence that contains at least one, in reading
 * order.
 */
export function detectOverusedWords(spans: readonly ProseSpan[]): OverusedWordCandidate[] {
  return spans.flatMap(detectInSpan);
}

// region | Helpers

/** Maps each form, the base included, to its watchlist word. */
const BASE_BY_FORM: ReadonlyMap<string, string> = new Map(
  [...OVERUSED_WORDS].flatMap(([base, forms]) => [base, ...forms].map((form): [string, string] => [form, base])),
);

/**
 * Any form as a whole word, in any case. The word boundaries leave out a derivative such as `standard` or `costly`,
 * which the list does not name.
 */
const FORM_PATTERN = new RegExp(`\\b(?:${[...BASE_BY_FORM.keys()].join('|')})\\b`, 'giu');

/** The rest of the fixed phrase "stand in for", read from just past a form of `stand`. */
const STAND_IN_FOR = /^\s+in\s+for\b/iu;

/** Returns one candidate per sentence of a span that contains a watchlist form outside a code span. */
function detectInSpan(span: ProseSpan): OverusedWordCandidate[] {
  const codeSpans = findCodeSpans(span.text);
  const bySentence = new Map<number, { end: number; words: string[] }>();

  for (const match of span.text.matchAll(FORM_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (codeSpans.some((code) => start >= code.start && start < code.end)) continue;

    const base = BASE_BY_FORM.get(match[0].toLowerCase());
    if (base === undefined) continue;
    if (base === 'stand' && STAND_IN_FOR.test(span.text.slice(end))) continue;

    const bounds = findSentenceBounds(span.text, start, end);
    const sentence = bySentence.get(bounds.start) ?? { end: bounds.end, words: [] };
    if (!sentence.words.includes(base)) sentence.words.push(base);
    bySentence.set(bounds.start, sentence);
  }

  return [...bySentence].map(([start, { end, words }]): OverusedWordCandidate => {
    const sentence = flattenWhitespace(span.text.slice(start, end));
    return {
      rule: 'overused-word',
      file: span.file,
      line: span.line + countNewlinesBefore(span.text, start),
      phrase: sentence,
      sentence,
      words,
    };
  });
}

// endregion | Helpers

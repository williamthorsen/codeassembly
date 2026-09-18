/**
 * `so` detection.
 *
 * The rule permits a `so` that states a direct result and limits how often a clause-joining `so` recurs. Because no
 * neighboring word tells a result from an imprecise use after a comma, the detector reports only what a neighboring
 * word or the distance between sites settles: a bare `so`, which nothing before it marks as a result, and a `so` within
 * the rule's gap after another. A use that a neighboring word places outside the rule ("so that", "so-called", "do so",
 * "if so", and the degree adverb before a quantity word) is neither reported nor counted.
 */
import { countNewlinesBefore, findCodeSpans, flattenWhitespace, listSentenceBounds } from './span-text.ts';
import type { ProseSpan, SoCandidate } from './types.ts';

/**
 * Scans every span for a bare `so` or a `so` within the rule's gap after another, returning one candidate per sentence
 * that holds one, grouped by file and in reading order within each.
 */
export function detectSoUses(spans: readonly ProseSpan[]): SoCandidate[] {
  return Map.groupBy(spans, (span) => span.file)
    .values()
    .flatMap(detectInFile)
    .toArray();
}

// region | Helpers

/**
 * Words that mark a preceding `so` as a degree adverb ("so many") or as part of "and so on". After a comma, a
 * semicolon, or a sentence boundary they mark nothing: "The cache is cold, so many requests are slow" joins two clauses.
 */
const DEGREE_FOLLOWERS: ReadonlyArray<string> = ['far', 'few', 'little', 'many', 'much', 'on'];

/** Words after which `so` stands for a clause, as in "do so" and "if so". */
const PRO_FORM_PRECEDERS: ReadonlyArray<string> = [
  'did',
  'do',
  'does',
  'doing',
  'done',
  'if',
  'said',
  'say',
  'saying',
  'says',
];

/** Matches text ending in a mark that joins a following `so` to a result: a comma, a semicolon, a dash, or "and". */
const RESULT_MARKER = /(?:[,;–—]|--|\band)\s*$/iu;

/**
 * The rule's gap, in sentences. The rule asks for at least three sentences between one clause-joining `so` and the
 * next, which a site in any of the three sentences before another breaks.
 */
const RULE_GAP_SENTENCES = 3;

/** The word in any case, less every use that a neighboring word places outside the rule. */
const SO = new RegExp(
  String.raw`(?<!\b(?:${PRO_FORM_PRECEDERS.join('|')})\s+)` +
    String.raw`(?:(?<=(?:^|[,;.!?])\s*)\bso\b|\bso\b(?!\s+(?:${DEGREE_FOLLOWERS.join('|')})\b))` +
    String.raw`(?!-|\s+that\b)`,
  'giu',
);

/** One sentence of a span, with the count of `so` sites that it holds and whether any of them is bare. */
interface SiteSentence {
  file: string;
  hasBareSite: boolean;
  line: number;
  siteCount: number;
  text: string;
}

/**
 * Returns one file's candidates, counting sentences across its spans in line order. A sentence is reported when it
 * holds a bare site, two sites, or a site after another within the gap.
 */
function detectInFile(spans: readonly ProseSpan[]): SoCandidate[] {
  const sentences = spans.toSorted((a, b) => a.line - b.line).flatMap(listSiteSentences);
  const candidates: SoCandidate[] = [];

  for (const [index, sentence] of sentences.entries()) {
    if (sentence.siteCount === 0) continue;

    const preceding = sentences.slice(Math.max(0, index - RULE_GAP_SENTENCES), index);
    const isRepeat = sentence.siteCount > 1 || preceding.some((other) => other.siteCount > 0);
    if (!sentence.hasBareSite && !isRepeat) continue;

    candidates.push({
      rule: 'so',
      file: sentence.file,
      line: sentence.line,
      phrase: sentence.text,
      sentence: sentence.text,
      // A purpose repair removes the site, which also removes any repeat that it formed.
      trigger: sentence.hasBareSite ? 'bare' : 'repeat',
    });
  }

  return candidates;
}

/** Reports whether a site is bare, given its sentence's text before it: A word precedes it, and no result marker does. */
function isBareSite(textBefore: string): boolean {
  return /[\p{L}\p{N}]/u.test(textBefore) && !RESULT_MARKER.test(textBefore);
}

/** Lists every sentence of a span in reading order, sites or none, so that a file's sentences can be counted. */
function listSiteSentences(span: ProseSpan): SiteSentence[] {
  const codeSpans = findCodeSpans(span.text);
  const siteIndexes = span.text
    .matchAll(SO)
    .map((match) => match.index)
    .filter((index) => codeSpans.every((code) => index < code.start || index >= code.end))
    .toArray();

  return listSentenceBounds(span.text).map(({ start, end }): SiteSentence => {
    const sites = siteIndexes.filter((index) => index >= start && index < end);
    return {
      file: span.file,
      hasBareSite: sites.some((index) => isBareSite(span.text.slice(start, index))),
      line: span.line + countNewlinesBefore(span.text, start),
      siteCount: sites.length,
      text: flattenWhitespace(span.text.slice(start, end)),
    };
  });
}

// endregion | Helpers

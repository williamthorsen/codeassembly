/**
 * `so` detection.
 *
 * The rule forbids a `so` that joins two clauses and leaves every other use alone. Only a reading tells the uses apart,
 * except when a neighboring word settles it: "so that", "so-called", "do so", "if so", and the degree adverb before a
 * quantity word. The detector passes over those and reports every other sentence holding the word, leaving the sense
 * to the adjudicator.
 */
import { findMatchingSentences } from './span-text.ts';
import type { ProseSpan, SoCandidate } from './types.ts';

/**
 * Scans every span for a `so` that may join two clauses, returning one candidate per sentence that holds one, in
 * reading order. The phrase is the sentence because one word resolves to nothing: A rejection recorded against it would
 * match every other `so` in the file.
 */
export function detectSoUses(spans: readonly ProseSpan[]): SoCandidate[] {
  return spans.flatMap((span) =>
    findMatchingSentences(span, SO).map(({ line, sentence }): SoCandidate => ({
      rule: 'so',
      file: span.file,
      line,
      phrase: sentence,
      sentence,
    })),
  );
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

/** The word in any case, less every use that a neighboring word places outside the rule. */
const SO = new RegExp(
  String.raw`(?<!\b(?:${PRO_FORM_PRECEDERS.join('|')})\s+)` +
    String.raw`(?:(?<=(?:^|[,;.!?])\s*)\bso\b|\bso\b(?!\s+(?:${DEGREE_FOLLOWERS.join('|')})\b))` +
    String.raw`(?!-|\s+that\b)`,
  'giu',
);

// endregion | Helpers

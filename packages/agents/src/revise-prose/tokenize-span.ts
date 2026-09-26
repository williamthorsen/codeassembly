/**
 * Word tokens over a prose span, shared by the detectors that read a clause word by word.
 */

/** Auxiliary and modal verbs, the closed class that opens a finite verb chain without being its lexical verb. */
export const AUXILIARIES: ReadonlySet<string> = new Set([
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

/** One word of a span, with its offsets and whether clause punctuation precedes it. */
export interface Token {
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

/** Splits a span into words, recording each word's offsets and whether clause punctuation precedes it. */
export function tokenize(text: string): Token[] {
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

// region | Helpers

/** Punctuation that ends a clause when it adjoins a word; standing alone, any punctuation ends one. */
const CLAUSE_BREAK_PATTERN = /[,;:.!?()[\]{}"\u{2013}\u{2014}]/u;

// endregion | Helpers

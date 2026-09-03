import { describe, expect, it } from 'vitest';

import { CODE_SPAN_PLACEHOLDER, CODE_SPAN_PLACEHOLDER_WORD, maskCodeSpans } from '../mask-code-spans.ts';

/** The placeholder with the spacing the masker writes around it, so an expectation reads as the output does. */
const MASK = ` ${CODE_SPAN_PLACEHOLDER} `;

describe(maskCodeSpans, () => {
  it('returns text holding no code span unchanged', () => {
    expect(maskCodeSpans('The source that it names.')).toBe('The source that it names.');
  });

  it('replaces a span, leaving no backtick behind', () => {
    expect(maskCodeSpans('The root `tsconfig.json` names it.')).toBe(`The root ${MASK} names it.`);
  });

  it('replaces a multi-backtick span, which may hold a backtick of its own', () => {
    expect(maskCodeSpans('The form ``a `b` pair`` reads oddly.')).toBe(`The form ${MASK} reads oddly.`);
  });

  it('replaces each span on a line separately, so neither one swallows the text between them', () => {
    expect(maskCodeSpans('Pass `--store` before `--tags`.')).toBe(`Pass ${MASK} before ${MASK}.`);
  });

  it('leaves an unpaired backtick as written, since it delimits nothing', () => {
    expect(maskCodeSpans('A stray ` and the words after it.')).toBe('A stray ` and the words after it.');
  });

  it('keeps every later pair in view past an unpaired run of a different length', () => {
    expect(maskCodeSpans('A stray `` then `a span` after it.')).toBe(`A stray \`\` then ${MASK} after it.`);
  });

  it('re-emits the newlines a wrapped span covered, so a later offset keeps its source line', () => {
    const masked = maskCodeSpans('Before `a span\nthat wraps` after.');

    expect(masked).toBe(`Before ${MASK}\n after.`);
  });

  it('separates the placeholder from its neighbors, so neither fuses into one token', () => {
    expect(maskCodeSpans('run`--flag`now')).toBe(`run${MASK}now`);
  });
});

describe('CODE_SPAN_PLACEHOLDER_WORD', () => {
  it('is the placeholder with its delimiters stripped, which is the form a tokenizer reads', () => {
    expect(CODE_SPAN_PLACEHOLDER_WORD).toBe('codespan');
    expect(CODE_SPAN_PLACEHOLDER).toContain(CODE_SPAN_PLACEHOLDER_WORD);
  });
});

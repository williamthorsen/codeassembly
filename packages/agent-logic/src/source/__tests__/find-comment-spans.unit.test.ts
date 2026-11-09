import { describe, expect, it } from 'vitest';

import { findCommentSpans } from '../find-comment-spans.ts';

describe(findCommentSpans, () => {
  it('returns the span of a comment on one line, delimiters included', () => {
    const prompt = 'Greet. <!-- note --> Wait.';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('returns a comment that spans lines as one span', () => {
    const prompt = 'Greet.\n<!-- first\nsecond -->\nWait.';

    expect(findCommentSpans(prompt)).toStrictEqual([{ start: 7, end: 28 }]);
  });

  it('ends each comment at the first closing delimiter, so adjacent comments stay apart', () => {
    const prompt = '<!-- a --><!-- b -->';

    expect(findCommentSpans(prompt)).toStrictEqual([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
    ]);
  });

  it('returns no span for an opener without a closing delimiter', () => {
    expect(findCommentSpans('Greet. <!-- unclosed\nWait.')).toStrictEqual([]);
  });

  it('returns no span for a comment written as an example in a code span', () => {
    expect(findCommentSpans('Keep each `<!-- marker -->` line and ``a `<!-- b -->` c``.')).toStrictEqual([]);
  });

  it('returns no span for a comment inside a fenced code block, closed or not', () => {
    expect(findCommentSpans('Greet.\n```md\n<!-- example -->\n```\nWait.\n~~~\n<!-- open -->')).toStrictEqual([]);
  });

  it('ends a fenced code block at its closing fence in a prompt with CRLF line endings', () => {
    const prompt = 'Greet.\r\n```md\r\n<!-- example -->\r\n```\r\n<!-- note -->\r\nWait.';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('does not let an unclosed opener in a code span reach a later comment', () => {
    const prompt = 'A `<!-- codeassembly-` marker. Greet.\n<!-- note -->';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('does not pair a lone backtick with a backtick past a blank line', () => {
    const prompt = 'Quote a ` mark.\n\nKeep `x` <!-- note -->';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('does not open a fence at a line whose backtick run is an inline code span', () => {
    const prompt = '```js``` is a span. <!-- note -->';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('returns no span inside a fence nested under a list item, and returns a comment after it', () => {
    const prompt = [
      '- Look up the order.',
      '  - Show the template:',
      '',
      '      ```md',
      '      <!-- example -->',
      '',
      '      Done.',
      '      ```',
      '',
      '<!-- note -->',
    ].join('\n');

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- note -->']);
  });

  it('returns a comment that contains a backtick', () => {
    const prompt = 'Greet. <!-- see `notes.md -->';

    const spans = findCommentSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['<!-- see `notes.md -->']);
  });
});

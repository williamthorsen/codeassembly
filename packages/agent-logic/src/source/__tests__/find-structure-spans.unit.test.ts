import { describe, expect, it } from 'vitest';

import { findStructureSpans } from '../find-structure-spans.ts';

describe(findStructureSpans, () => {
  it('finds each heading with its level and the end of its marker', () => {
    const prompt = '# Title\n\nIntro.\n\n  ### Steps';

    expect(findStructureSpans(prompt)).toStrictEqual([
      { kind: 'heading', start: 0, end: 7, level: 1, markerEnd: 1 },
      { kind: 'heading', start: 19, end: 28, level: 3, markerEnd: 22 },
    ]);
  });

  it('finds a thematic break, a table header and separator row, and a line that holds only a tag', () => {
    const prompt = 'Intro.\n\n---\n\n| Field | Meaning |\n| --- | --- |\n| a | b |\n\n<HARD-GATE>\nObey.\n</HARD-GATE>';

    expect(findStructureSpans(prompt).map(({ kind, start, end }) => [kind, prompt.slice(start, end)])).toStrictEqual([
      ['line', '---'],
      ['line', '| Field | Meaning |'],
      ['line', '| --- | --- |'],
      ['line', '<HARD-GATE>'],
      ['line', '</HARD-GATE>'],
    ]);
  });

  it("finds the marker of each list item, without its indent, the space after it, or the item's prose", () => {
    const prompt = '1. Ask.\n2) Wait.\n   - Nested.\n* Star.';

    expect(findStructureSpans(prompt).map(({ kind, start, end }) => [kind, prompt.slice(start, end)])).toStrictEqual([
      ['list-marker', '1.'],
      ['list-marker', '2)'],
      ['list-marker', '-'],
      ['list-marker', '*'],
    ]);
  });

  it('finds a leading front matter as one span that ends with its closing line', () => {
    const prompt = '---\nname: x\n---\nDo it.';

    expect(findStructureSpans(prompt)).toStrictEqual([{ kind: 'line', start: 0, end: 15 }]);
  });

  it('finds nothing inside a fenced block or an HTML comment', () => {
    const prompt = '```sh\n# a shell comment\n- not an item\n```\n<!--\n# Hidden\n-->\nDo it.';

    expect(findStructureSpans(prompt)).toStrictEqual([]);
  });

  it('keeps the offsets of a prompt with CRLF line endings', () => {
    const prompt = 'Intro.\r\n## Steps\r\n- Ask.';

    expect(findStructureSpans(prompt)).toStrictEqual([
      { kind: 'heading', start: 8, end: 16, level: 2, markerEnd: 10 },
      { kind: 'list-marker', start: 18, end: 19 },
    ]);
  });
});

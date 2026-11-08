import { describe, expect, it } from 'vitest';

import { findGateSpans } from '../find-gate-spans.ts';

describe(findGateSpans, () => {
  it("returns each gate's body without its tags or surrounding whitespace", () => {
    const prompt = 'Greet.\n<HARD-GATE>\nNever skip.\n</HARD-GATE>\nWait. <HARD-GATE>Stop first.</HARD-GATE>';

    const spans = findGateSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['Never skip.', 'Stop first.']);
  });

  it('returns no span for an opening tag without a closing tag, or for an empty body', () => {
    expect(findGateSpans('<HARD-GATE>\n</HARD-GATE> Greet. <HARD-GATE> Never skip.')).toStrictEqual([]);
  });

  it('skips a gate inside an HTML comment', () => {
    const prompt = '<!-- <HARD-GATE>Old.</HARD-GATE> --> <HARD-GATE>New.</HARD-GATE>';

    const spans = findGateSpans(prompt);

    expect(spans.map(({ start, end }) => prompt.slice(start, end))).toStrictEqual(['New.']);
  });
});

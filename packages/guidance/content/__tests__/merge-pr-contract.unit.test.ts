import { describe, expect, it } from 'vitest';

import { readContentFile } from '../test-utils/read-content-file.ts';

// `merge-pr` settles every type defect and every disagreement with the work-type test before the merge is offered.
// A step that asks which type to take overrides the `option-format` gate inlined into the same body, so the guard
// has to be on the step's wording.

/**
 * Phrases that a restored type question contains. Lowercased, so that a sentence's opening capital still matches.
 */
const TYPE_ASK_PHRASES: ReadonlyArray<string> = [
  'ask for the type',
  "ask step 6's type question",
  'ask one question per entry defect',
  'raise that as a question here',
];

const EXPANDED = readContentFile('skills/merge-pr/SKILL.md');

describe('merge-pr contract', () => {
  it('decides each type rather than asking the developer', async () => {
    const text = (await EXPANDED).toLowerCase();
    const found = TYPE_ASK_PHRASES.filter((phrase) => text.includes(phrase));

    const message =
      'A type is a determination by the work-type test, which this session applies with the diff in hand. An ask ' +
      `hands the developer a close call with less of the evidence. These phrases are back:\n  ${found.join('\n  ')}`;
    expect(text).toContain('never by asking which to choose');
    expect(found, message).toEqual([]);
  });

  it('asks once to authorize the entry amendments that rewrite the PR body', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('ask once to authorize all of them');
  });

  it("keeps a type that the developer named over the test's type", async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('a type that the developer named, through `--type` or in an answer at the gate, stands');
  });

  it('invokes nothing after the merge but the ripple offer', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain("invoke nothing but step 12's offer");
  });

  it('offers the ripple after reporting the outcome and before the closing notes', async () => {
    const text = await EXPANDED;
    const reportIndex = text.indexOf('### 11. Report the outcome');
    const rippleIndex = text.indexOf('### 12. Offer the ripple');
    const importantIndex = text.indexOf('## Important');

    expect(reportIndex).toBeGreaterThan(-1);
    expect(rippleIndex).toBeGreaterThan(reportIndex);
    expect(importantIndex).toBeGreaterThan(rippleIndex);
  });

  it('ripples the ticket that the merge commit closes rather than the session ticket', async () => {
    const text = await EXPANDED;

    expect(text).toContain(
      'when `effective_record.ticket_ref` from step 3 is null or is not a GitHub `#{N}` reference',
    );
    expect(text).toContain('Take the ticket from that field rather than from session context');
  });

  it('reports an empty related set in one line and records the empty ripple', async () => {
    const text = await EXPANDED;

    expect(text).toContain('groom-backlog.mjs related --ticket {N}');
    expect(text).toContain('No open tickets related to #{N}.');
    expect(text).toContain('"candidates":[]');
    expect(text).toContain('record --run ripple-{N}');
  });

  it('offers a non-empty ripple with the counts by tier and runs it only on consent', async () => {
    const text = (await EXPANDED).toLowerCase();

    expect(text).toContain('{file-overlap} that name a file that the pr touched');
    expect(text).toContain('invoke nothing without consent');
    expect(text).toContain('with `--related-to {n}`');
  });
});

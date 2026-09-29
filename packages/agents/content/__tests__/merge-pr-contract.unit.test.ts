import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';

// `merge-pr` settles every type defect and every disagreement with the work-type test before the merge is offered.
// A step that asks which type to take overrides the `option-format` gate inlined into the same body, so the guard
// has to be on the step's wording.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/**
 * Phrases that a restored type question contains. Lowercased, so that a sentence's opening capital still matches.
 */
const TYPE_ASK_PHRASES: ReadonlyArray<string> = [
  'ask for the type',
  "ask step 6's type question",
  'ask one question per entry defect',
  'raise that as a question here',
];

const EXPANDED = expandIncludes(path.join(CONTENT_ROOT, 'skills', 'merge-pr', 'SKILL.md'), CONTENT_ROOT);

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
});

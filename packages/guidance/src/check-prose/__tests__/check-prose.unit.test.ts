import { describe, expect, it } from 'vitest';

import { RULE_IDS } from '../../revise-prose/rules.ts';
import { checkProse, renderCheckJson, renderCheckText } from '../check-prose.ts';

describe(checkProse, () => {
  it('runs every registered rule', () => {
    expect(checkProse({ file: 'body.md', content: 'A plain sentence.\n' }).rules).toStrictEqual(RULE_IDS);
  });

  it('reports a watchlist word and a negative quantifier in one sentence', () => {
    const check = checkProse({
      file: 'body.md',
      content: 'The branch commits a squash collapses reach no changelog.\n',
    });

    expect(check.candidates.map((candidate) => candidate.rule).toSorted()).toStrictEqual([
      'negative-quantifier',
      'overused-word',
    ]);
  });

  it('reads a file with any extension as Markdown', () => {
    const check = checkProse({ file: 'prose.txt', content: 'The fix will land soon.\n' });

    expect(check.candidates.map((candidate) => candidate.rule)).toStrictEqual(['overused-word']);
  });

  it('passes over a word inside a code span or a fence', () => {
    const content = 'Call `route` with the finding.\n\n```sh\nship it\n```\n';

    expect(checkProse({ file: 'body.md', content }).candidates).toStrictEqual([]);
  });

  it('returns an empty candidate list for empty prose', () => {
    expect(checkProse({ file: 'body.md', content: '' }).candidates).toStrictEqual([]);
  });
});

describe(renderCheckJson, () => {
  it('renders the file, the rules, and the candidates as one JSON document', () => {
    const check = checkProse({ file: 'body.md', content: 'The fix will land soon.\n' });

    expect(JSON.parse(renderCheckJson(check))).toStrictEqual({
      file: 'body.md',
      rules: RULE_IDS,
      candidates: [expect.objectContaining({ rule: 'overused-word', file: 'body.md', line: 1 })],
    });
  });
});

describe(renderCheckText, () => {
  it('renders each candidate on one line, collapsing the whitespace in its sentence, then a count', () => {
    const check = checkProse({ file: 'body.md', content: 'The fix will\nland   soon.\n' });

    expect(renderCheckText(check)).toBe('body.md:1: overused-word: The fix will land soon.\nbody.md: 1 candidate(s)\n');
  });
});

import { describe, expect, it } from 'vitest';

import { detectSecondPersonPronouns } from '../detect-second-person.ts';
import type { ProseSpan, SecondPersonCandidate } from '../types.ts';

describe(detectSecondPersonPronouns, () => {
  it('reports a sentence holding a pronoun, with the sentence as the phrase', () => {
    expect(detect('Pass your config to the flag.')).toStrictEqual([
      {
        rule: 'second-person',
        file: 'docs/guide.md',
        line: 1,
        phrase: 'Pass your config to the flag.',
        sentence: 'Pass your config to the flag.',
      },
    ]);
  });

  it.each(['you', 'You', 'your', 'yours', 'yourself', 'yourselves', "you're", 'you\u{2019}ll'])(
    'reports %s',
    (pronoun) => {
      expect(detect(`The choice is ${pronoun} to make.`)).toHaveLength(1);
    },
  );

  it('passes over a word that only begins with the pronoun', () => {
    expect(detect('The youth league keeps a youthful schedule.')).toStrictEqual([]);
  });

  it('reports one candidate for a sentence holding two pronouns', () => {
    expect(detect('You set your own budget.')).toHaveLength(1);
  });

  it('passes over a pronoun inside an inline code span', () => {
    expect(detect('The template renders `you` as the actor.')).toStrictEqual([]);
  });

  it.each(['content/skills/revise-prose/SKILL.md', 'content/subagents/prose-reviser.md', '.claude/agents/reviewer.md'])(
    'passes over the skill or subagent body at %s, whose pronouns address its executor',
    (file) => {
      expect(detect('You read each file whole.', file)).toStrictEqual([]);
    },
  );

  it.each([
    'packages/agents/README.md',
    'content/skills/revise-prose/notes.md',
    'content/subagents/prose-reviser.ts',
    'docs/agents/guide.md',
  ])('reports a pronoun in %s, which is no skill or subagent body', (file) => {
    expect(detect('You read each file whole.', file)).toHaveLength(1);
  });
});

// region | Helpers

/** Detects over one single-line span, in `docs/guide.md` unless an assertion names a file. */
function detect(text: string, file = 'docs/guide.md'): SecondPersonCandidate[] {
  const span: ProseSpan = { file, line: 1, text };
  return detectSecondPersonPronouns([span]);
}

// endregion | Helpers

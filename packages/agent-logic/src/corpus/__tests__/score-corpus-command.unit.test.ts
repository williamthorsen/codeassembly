import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SOURCE_FILES } from '../score-corpus.ts';
import { parseScoreArgs } from '../score-corpus-command.ts';

const FIXTURE_SKILL = path.join(import.meta.dirname, 'fixtures/sources/SKILL.md');

describe(parseScoreArgs, () => {
  it('compares against the pinned skill and writes the scorecard without arguments', () => {
    expect(parseScoreArgs([])).toStrictEqual({ sources: SOURCE_FILES, prompt: undefined });
  });

  it('replaces the skill with the copy that --skill names, resolved against the working directory', () => {
    const relative = path.relative(process.cwd(), FIXTURE_SKILL);

    expect(parseScoreArgs(['--skill', relative, '--prompt', 'greeter'])).toStrictEqual({
      sources: { skill: FIXTURE_SKILL, rules: SOURCE_FILES.rules },
      prompt: 'greeter',
    });
  });

  it('throws, naming the path, when the skill file does not exist', () => {
    const missing = path.join(import.meta.dirname, 'fixtures/sources/absent.md');

    expect(() => parseScoreArgs(['--skill', missing])).toThrow(`the skill file ${missing} does not exist`);
  });
});

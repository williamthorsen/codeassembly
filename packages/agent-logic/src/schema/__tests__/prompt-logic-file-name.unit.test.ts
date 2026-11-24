import { describe, expect, it } from 'vitest';

import { dropPromptLogicSuffix, isPromptLogicFileName } from '../prompt-logic-file-name.ts';

describe(isPromptLogicFileName, () => {
  it.each([
    ['chart.prompt-logic.json', true],
    ['chart.agent-logic.json', true],
    ['.prompt-logic.json', false],
    ['.agent-logic.json', false],
    ['chart.json', false],
  ])('reports %j as %j', (name, expected) => {
    expect(isPromptLogicFileName(name)).toBe(expected);
  });
});

describe(dropPromptLogicSuffix, () => {
  it.each([
    ['chart.prompt-logic.json', 'chart'],
    ['chart.agent-logic.json', 'chart'],
    ['.agent-logic.json', ''],
    ['chart.json', 'chart.json'],
  ])('returns %j as %j', (name, expected) => {
    expect(dropPromptLogicSuffix(name)).toBe(expected);
  });
});

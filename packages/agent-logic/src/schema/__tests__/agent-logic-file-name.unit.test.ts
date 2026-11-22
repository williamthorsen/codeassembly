import { describe, expect, it } from 'vitest';

import { isAgentLogicFileName } from '../agent-logic-file-name.ts';

describe(isAgentLogicFileName, () => {
  it.each([
    ['chart.agent-logic.json', true],
    ['.agent-logic.json', false],
    ['chart.json', false],
  ])('reports %j as %j', (name, expected) => {
    expect(isAgentLogicFileName(name)).toBe(expected);
  });
});

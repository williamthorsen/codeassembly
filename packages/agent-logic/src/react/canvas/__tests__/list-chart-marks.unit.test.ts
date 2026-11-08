// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { describeConfig } from '../../../layout/describe-config.ts';
import { toFlowElements } from '../../../layout/to-flow-elements.ts';
import type { AgentLogicConfig, TransitionConfig } from '../../../schema/agent-logic-schema.ts';
import { buildMinimalConfig } from '../../../test-utils/minimal-config.ts';
import { MINIMAL_LAYOUT } from '../../../test-utils/minimal-layout.ts';
import { listChartMarks } from '../list-chart-marks.ts';

describe(listChartMarks, () => {
  it('lists the marks that the minimal chart draws, and none that it does not', () => {
    expect(listMarks(buildMinimalConfig())).toStrictEqual(new Set(['ends', 'starts-here', 'waits-for-user']));
  });

  it('lists an inferred transition as inferred', () => {
    const config = buildWithReply({ target: '#done', meta: { source: { start: 39, end: 60 }, inferred: true } });

    expect(listMarks(config)).toContain('inferred');
  });

  it('lists a gated transition as a gate', () => {
    const config = buildWithReply({ target: '#done', meta: { source: { start: 39, end: 60 }, gate: true } });

    expect(listMarks(config)).toContain('gate');
  });

  it('lists a lone guarded transition as lacking an alternative', () => {
    const config = buildWithReply({
      target: '#done',
      guard: { type: 'nl', params: { text: 'the reply is a yes' } },
      meta: { source: { start: 39, end: 60 } },
    });

    expect(listMarks(config)).toContain('no-alternative');
  });
});

// region | Helpers
/** Builds the minimal config with its one transition replaced. */
function buildWithReply(transition: TransitionConfig): AgentLogicConfig {
  const config = buildMinimalConfig();
  const { greeting } = config.states;
  if (greeting === undefined) throw new Error('The minimal config has no greeting state.');
  greeting.on = { 'user.replied': transition };
  return config;
}

/** Returns the marks of a config laid out as the minimal config. */
function listMarks(config: AgentLogicConfig): Set<string> {
  return listChartMarks(toFlowElements(describeConfig(config), MINIMAL_LAYOUT));
}
// endregion | Helpers

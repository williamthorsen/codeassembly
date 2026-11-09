import { describe, expect, it } from 'vitest';

import { examples } from '../../examples/examples.ts';
import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { validateConfig } from '../../schema/validate-config.ts';
import { buildMinimalConfig, MINIMAL_PROMPT } from '../../test-utils/minimal-config.ts';
import { describeConfig } from '../describe-config.ts';
import { layoutConfig } from '../layout-config.ts';
import { estimatePreambleHeight } from '../pack-preamble.ts';

describe(layoutConfig, () => {
  it.each(examples)('lays out every state and routes every transition of $name', async ({ value }) => {
    const result = validateConfig(value);
    if (!result.ok) throw new Error('example is invalid');

    const { nodes, edges } = await layoutConfig(result.config);

    expect(nodes.every(({ width, height }) => (width ?? 0) > 0 && (height ?? 0) > 0)).toBe(true);
    expect(edges.every(({ data }) => (data?.points.length ?? 0) >= 2)).toBe(true);
  });

  it("widens a flow to its shown preamble and moves the flow's children below it", async () => {
    const config = buildMinimalConfig();
    config.meta.ambient = [{ start: 0, end: 14 }];

    const hidden = await layoutConfig(config, { showAmbient: false });
    const shown = await layoutConfig(config, { showAmbient: true });

    const root = shown.nodes.find(({ id }) => id === 'agent');
    expect(root?.width).toBeGreaterThanOrEqual(528);
    expect(root?.data.ambient?.map(({ text }) => text)).toStrictEqual(['Greet the user']);
    expect(root?.data.preambleLayout?.columns).toBe(1);
    expect(hidden.nodes.find(({ id }) => id === 'agent')?.data.ambient).toBeUndefined();
    expect(findY(shown, 'greeting')).toBeGreaterThan(findY(hidden, 'greeting'));
  });

  it('widens a nested flow to its preamble, and the flow around it with it', async () => {
    const config = buildMinimalConfig();
    const { greeting } = config.states;
    if (greeting === undefined) throw new Error('fixture lacks greeting');
    greeting.initial = 'inner';
    greeting.states = { inner: { id: 'inner', meta: { source: { start: 0, end: 5 } } } };
    greeting.meta.ambient = [{ start: 62, end: 68 }];

    const { nodes } = await layoutConfig(config, { showAmbient: true });

    expect(nodes.find(({ id }) => id === 'greeting')?.width).toBeGreaterThanOrEqual(528);
    expect(nodes.find(({ id }) => id === 'agent')?.width).toBeGreaterThan(528);
  });

  it("lays a wide flow's preamble out in columns and reserves only their height above its children", async () => {
    const config = buildWideConfig();
    const { ambient } = describeConfig(config);

    const hidden = await layoutConfig(config, { showAmbient: false });
    const shown = await layoutConfig(config, { showAmbient: true });

    const root = shown.nodes.find(({ id }) => id === 'agent');
    expect(root?.width).toBeGreaterThanOrEqual(1040);
    const columns = root?.data.preambleLayout?.columns ?? 0;
    expect(columns).toBeGreaterThanOrEqual(2);
    const reserved = findY(shown, 'start') - findY(hidden, 'start');
    expect(reserved).toBe(estimatePreambleHeight(ambient, columns));
    expect(reserved).toBeLessThan(estimatePreambleHeight(ambient, 1));
  });
});

// region | Helpers
/** Builds a config whose root flow holds five leaves that its initial state reaches, and four ambient instructions. */
function buildWideConfig(): AgentLogicConfig {
  const leaves = ['a', 'b', 'c', 'd', 'e'];
  return {
    id: 'agent',
    initial: 'start',
    states: {
      start: {
        id: 'start',
        on: Object.fromEntries(
          leaves.map((leaf) => [`go.${leaf}`, { target: `#${leaf}`, meta: { source: { start: 39, end: 60 } } }]),
        ),
        meta: { source: { start: 0, end: 38 } },
      },
      ...Object.fromEntries(
        leaves.map((leaf) => [leaf, { id: leaf, type: 'final', meta: { source: { start: 62, end: 68 } } }]),
      ),
    },
    meta: {
      prompt: MINIMAL_PROMPT,
      source: { start: 0, end: MINIMAL_PROMPT.length },
      unconverted: [],
      ambient: [
        { start: 0, end: 14 },
        { start: 16, end: 38 },
        { start: 39, end: 60 },
        { start: 62, end: 68 },
      ],
    },
  };
}

function findY({ nodes }: Awaited<ReturnType<typeof layoutConfig>>, id: string): number {
  return nodes.find((node) => node.id === id)?.position.y ?? NaN;
}
// endregion | Helpers

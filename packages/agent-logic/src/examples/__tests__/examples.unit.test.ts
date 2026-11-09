import { describe, expect, it } from 'vitest';
import { createMachine } from 'xstate';

import type { AgentLogicConfig } from '../../schema/agent-logic-schema.ts';
import { listStates, listTransitions } from '../../schema/config-traversal.ts';
import { validateConfig } from '../../schema/validate-config.ts';
import { examples } from '../examples.ts';

describe('bundled examples', () => {
  it.each(examples)('$name satisfies the schema and loads as an XState machine', ({ value }) => {
    expect(validateConfig(value)).toMatchObject({ ok: true });
    expect(() => createMachine(isMachineConfig(value) ? value : {})).not.toThrow();
  });

  it('together contain every element kind that the viewer renders', () => {
    const valid = examples.flatMap(({ value }) => {
      const result = validateConfig(value);
      return result.ok ? [result.config] : [];
    });

    expect(listElementKinds(valid)).toStrictEqual(
      new Set([
        'always-guard',
        'entry',
        'exit',
        'final',
        'global-transition',
        'inferred',
        'targetless',
        'unconverted',
        'waits-for-user',
      ]),
    );
  });
});

// region | Helpers
/** Narrows a value that the agent-logic schema accepts, which is a subset of XState's machine config. */
function isMachineConfig(value: unknown): value is Parameters<typeof createMachine>[0] {
  return validateConfig(value).ok;
}

function listElementKinds(configs: AgentLogicConfig[]): Set<string> {
  const kinds = new Set<string>();
  for (const config of configs) {
    if (config.meta.unconverted.length > 0) kinds.add('unconverted');
    for (const { state } of listStates(config)) {
      const isCompound = state.states !== undefined;
      if (state.entry !== undefined) kinds.add('entry');
      if (state.exit !== undefined) kinds.add('exit');
      if ('type' in state && state.type === 'final') kinds.add('final');
      if ('inferred' in state.meta && state.meta.inferred === true) kinds.add('inferred');
      for (const { event, transition } of listTransitions(state)) {
        if (isCompound && state !== config) kinds.add('global-transition');
        if (!isCompound && event?.startsWith('user.') === true) kinds.add('waits-for-user');
        if (event === undefined && transition.guard !== undefined) kinds.add('always-guard');
        if (transition.target === undefined) kinds.add('targetless');
        if (transition.meta.inferred === true) kinds.add('inferred');
      }
    }
  }
  return kinds;
}
// endregion | Helpers

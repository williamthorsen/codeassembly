import { describe, expect, it } from 'vitest';

import { buildMinimalConfig } from '../../test-utils/minimal-config.ts';
import { viewerContract } from '../viewer-contract.ts';

describe('viewerContract', () => {
  it('accepts the empty initial state', () => {
    expect(viewerContract.state.safeParse({}).success).toBe(true);
  });

  it('accepts a state with a chart and a selection', () => {
    const state = {
      chart: { source: 'File: a.agent-logic.json', downloadName: 'a.agent-logic.json', config: buildMinimalConfig() },
      selectedPath: 'states.greeting',
    };

    expect(viewerContract.state.safeParse(state).success).toBe(true);
  });

  it('rejects a chart whose config fails the agent-logic schema', () => {
    const state = { chart: { source: 'Pasted JSON', downloadName: 'pasted.agent-logic.json', config: { id: 'x' } } };

    expect(viewerContract.state.safeParse(state).success).toBe(false);
  });
});

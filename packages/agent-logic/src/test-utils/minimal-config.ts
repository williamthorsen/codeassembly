import type { AgentLogicConfig } from '../schema/agent-logic-schema.ts';

/** Prompt text of the minimal config. */
export const MINIMAL_PROMPT = 'Greet the user, then wait for a reply. When the user replies, finish.';

/** Builds a valid config with one waiting state and one final state, fresh on each call so that a test may mutate it. */
export function buildMinimalConfig(): AgentLogicConfig {
  return {
    id: 'agent',
    initial: 'greeting',
    states: {
      greeting: {
        id: 'greeting',
        entry: [{ type: 'nl', params: { text: 'greet the user' } }],
        on: {
          'user.replied': { target: '#done', meta: { source: { start: 39, end: 60 } } },
        },
        meta: { source: { start: 0, end: 38 } },
      },
      done: { id: 'done', type: 'final', meta: { source: { start: 62, end: 68 } } },
    },
    meta: { prompt: MINIMAL_PROMPT, source: { start: 0, end: MINIMAL_PROMPT.length }, unconverted: [] },
  };
}

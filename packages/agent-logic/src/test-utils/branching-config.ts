import type { AgentLogicConfig } from '../schema/agent-logic-schema.ts';

/** Prompt text of the branching config. */
export const BRANCHING_PROMPT =
  'Ask whether the user agrees. If they agree, finish. If they decline, check the order. ' +
  'Look the order up. When the lookup ends, finish. If they cancel during the check, finish. Finish.';

/**
 * Builds a valid config whose first state has two outgoing transitions, whose flow `checking` has a flow-wide
 * transition and a nested state, and whose final state has no outgoing transition.
 */
export function buildBranchingConfig(): AgentLogicConfig {
  return {
    id: 'agent',
    initial: 'asking',
    states: {
      asking: {
        id: 'asking',
        on: {
          'user.agreed': { target: '#done', meta: { source: findSpan('If they agree, finish.') } },
          'user.declined': { target: '#checking', meta: { source: findSpan('If they decline, check the order.') } },
        },
        meta: { source: findSpan('Ask whether the user agrees.') },
      },
      checking: {
        id: 'checking',
        initial: 'looking_up',
        on: {
          'user.cancelled': { target: '#done', meta: { source: findSpan('If they cancel during the check, finish.') } },
        },
        states: {
          looking_up: {
            id: 'looking_up',
            on: {
              'lookup.finished': { target: '#done', meta: { source: findSpan('When the lookup ends, finish.') } },
            },
            meta: { source: findSpan('Look the order up.') },
          },
        },
        meta: { source: findSpan('check the order.') },
      },
      done: { id: 'done', type: 'final', meta: { source: findSpan('Finish.') } },
    },
    meta: { prompt: BRANCHING_PROMPT, source: { start: 0, end: BRANCHING_PROMPT.length }, unconverted: [] },
  };
}

// region | Helpers
/** Returns the span of a passage of the prompt. */
function findSpan(passage: string): { start: number; end: number } {
  const start = BRANCHING_PROMPT.indexOf(passage);
  if (start === -1) throw new Error(`the prompt lacks "${passage}"`);
  return { start, end: start + passage.length };
}
// endregion | Helpers

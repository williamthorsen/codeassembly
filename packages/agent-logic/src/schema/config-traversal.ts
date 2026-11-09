import type { AgentLogicConfig, StateConfig, TransitionConfig } from './agent-logic-schema.ts';

/** A state or the root, which share the members that hold children and transitions. */
export type StateLike = AgentLogicConfig | StateConfig;

export interface StateEntry {
  /** Path from the root of the config to the state. */
  path: PropertyKey[];
  state: StateLike;
}

export interface TransitionEntry {
  /** Path from the transition's state to the transition. */
  path: PropertyKey[];
  /** The event that triggers the transition; absent for an `always` transition. */
  event: string | undefined;
  transition: TransitionConfig;
}

/** Lists each state with its path into the config, the root first, parents before children. */
export function listStates(config: AgentLogicConfig): StateEntry[] {
  const entries: StateEntry[] = [];
  visit([], config);
  return entries;

  function visit(path: PropertyKey[], state: StateLike): void {
    entries.push({ path, state });
    const children = Object.entries(state.states ?? {});
    for (const [key, child] of children) {
      visit([...path, 'states', key], child);
    }
  }
}

/** Lists each transition of a state, `on` before `always`. */
export function listTransitions(state: StateLike): TransitionEntry[] {
  const entries: TransitionEntry[] = [];
  const eventTransitions = Object.entries(state.on ?? {});
  for (const [event, transitions] of eventTransitions) {
    appendTransitions(entries, ['on', event], event, transitions);
  }
  if (state.always !== undefined) {
    appendTransitions(entries, ['always'], undefined, state.always);
  }
  return entries;
}

// region | Helpers
function appendTransitions(
  entries: TransitionEntry[],
  path: PropertyKey[],
  event: string | undefined,
  transitions: TransitionConfig | TransitionConfig[],
): void {
  if (!Array.isArray(transitions)) {
    entries.push({ path, event, transition: transitions });
    return;
  }
  for (const [index, transition] of transitions.entries()) {
    entries.push({ path: [...path, index], event, transition });
  }
}
// endregion | Helpers

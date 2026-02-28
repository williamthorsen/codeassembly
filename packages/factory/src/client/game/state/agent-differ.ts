import type { AgentConfig } from '../mappers/run-to-scene.js';

export interface AgentDiff {
  added: AgentConfig[];
  removed: AgentConfig[];
  moved: Array<{ prev: AgentConfig; next: AgentConfig }>;
  unchanged: AgentConfig[];
}

/** Check whether an agent's position-related fields changed between prev and next. */
function hasPositionChanged(prevAgent: AgentConfig, nextAgent: AgentConfig): boolean {
  return (
    prevAgent.stationIndex !== nextAgent.stationIndex ||
    prevAgent.stackOffset !== nextAgent.stackOffset ||
    prevAgent.level !== nextAgent.level ||
    (prevAgent.approaching ?? false) !== (nextAgent.approaching ?? false)
  );
}

/**
 * Compute the structural diff between two agent configuration arrays.
 * Agents are keyed by their `role` property.
 *
 * Categories:
 * - added: present in next but not in prev
 * - removed: present in prev but not in next
 * - moved: present in both but position changed
 * - unchanged: present in both with identical placement
 */
export function diffAgents(prev: ReadonlyArray<AgentConfig>, next: ReadonlyArray<AgentConfig>): AgentDiff {
  const prevByRole = new Map<string, AgentConfig>();
  for (const agent of prev) {
    prevByRole.set(agent.role, agent);
  }

  const nextByRole = new Map<string, AgentConfig>();
  for (const agent of next) {
    nextByRole.set(agent.role, agent);
  }

  const added: AgentConfig[] = [];
  const removed: AgentConfig[] = [];
  const moved: Array<{ prev: AgentConfig; next: AgentConfig }> = [];
  const unchanged: AgentConfig[] = [];

  // Identify added, moved, and unchanged from next
  for (const [role, nextAgent] of nextByRole) {
    const prevAgent = prevByRole.get(role);
    if (prevAgent === undefined) {
      added.push(nextAgent);
    } else if (hasPositionChanged(prevAgent, nextAgent)) {
      moved.push({ prev: prevAgent, next: nextAgent });
    } else {
      unchanged.push(nextAgent);
    }
  }

  // Identify removed from prev
  for (const [role, prevAgent] of prevByRole) {
    if (!nextByRole.has(role)) {
      removed.push(prevAgent);
    }
  }

  return { added, removed, moved, unchanged };
}

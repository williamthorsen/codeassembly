import type { AgentConfig, AgentDiffs, AgentStateDiff, OrchestratorConfig, OrchestratorDiff } from '../types.js';

/** Compare two orchestrator configs and return position/working changes. */
export function diffOrchestrator(prev: OrchestratorConfig, next: OrchestratorConfig): OrchestratorDiff {
  const moved = prev.stationIndex !== next.stationIndex ? { from: prev.stationIndex, to: next.stationIndex } : null;

  const workingChanged = prev.working !== next.working ? { from: prev.working, to: next.working } : null;

  return { moved, workingChanged };
}

/** Compare two agent arrays by id, detecting state changes, additions, and removals. */
export function diffAgents(prev: readonly AgentConfig[], next: readonly AgentConfig[]): AgentDiffs {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));

  const stateChanged: AgentStateDiff[] = [];
  const added: AgentConfig[] = [];
  const removed: AgentConfig[] = [];

  for (const [id, nextAgent] of nextById) {
    const prevAgent = prevById.get(id);
    if (prevAgent === undefined) {
      added.push(nextAgent);
    } else if (prevAgent.state !== nextAgent.state) {
      stateChanged.push({ agentId: id, from: prevAgent.state, to: nextAgent.state });
    }
  }

  for (const [id, prevAgent] of prevById) {
    if (!nextById.has(id)) {
      removed.push(prevAgent);
    }
  }

  return { stateChanged, added, removed };
}

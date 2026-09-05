import type {
  AgentConfig,
  AgentDiffs,
  AgentStateDiff,
  ArtifactDiffs,
  CatwalkDiff,
  CatwalkSceneConfig,
  GateConfig,
  GateDiffs,
  OrchestratorConfig,
  OrchestratorDiff,
  StationArtifactConfig,
} from '../types.ts';

/** Compare two orchestrator configs and return position/working/celebrating/carried/badge changes. */
export function diffOrchestrator(prev: OrchestratorConfig, next: OrchestratorConfig): OrchestratorDiff {
  const moved = prev.stationIndex === next.stationIndex ? null : { from: prev.stationIndex, to: next.stationIndex };

  const workingChanged = prev.working === next.working ? null : { from: prev.working, to: next.working };

  const celebratingChanged =
    prev.celebrating === next.celebrating ? null : { from: prev.celebrating, to: next.celebrating };

  const waitingChanged = prev.waiting === next.waiting ? null : { from: prev.waiting, to: next.waiting };

  const prevCarried = JSON.stringify(prev.carriedArtifacts);
  const nextCarried = JSON.stringify(next.carriedArtifacts);
  const carriedChanged =
    prevCarried === nextCarried ? null : { from: prev.carriedArtifacts, to: next.carriedArtifacts };

  const prevBadge = prev.codeBadge === null ? null : `${prev.codeBadge.label}:${prev.codeBadge.color}`;
  const nextBadge = next.codeBadge === null ? null : `${next.codeBadge.label}:${next.codeBadge.color}`;
  const codeBadgeChanged = prevBadge === nextBadge ? null : { from: prev.codeBadge, to: next.codeBadge };

  return { moved, workingChanged, celebratingChanged, waitingChanged, carriedChanged, codeBadgeChanged };
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

/** Compare two gate arrays by index, detecting gates that transitioned from closed to open. */
export function diffGates(prev: readonly GateConfig[], next: readonly GateConfig[]): GateDiffs {
  const opened: GateConfig[] = [];

  for (const [i, nextGate] of next.entries()) {
    const prevGate = prev[i];
    if (prevGate !== undefined && !prevGate.open && nextGate.open) {
      opened.push(nextGate);
    }
  }

  return { opened };
}

/** Build a composite identity key for an artifact (artifacts lack a single stable id). */
export function artifactKey(a: StationArtifactConfig): string {
  return `${a.stationIndex}:${a.agentSlotIndex}:${a.label}:${a.slot}:${a.version ?? 0}`;
}

/** Compare two artifact arrays, detecting newly added artifacts by composite key. */
export function diffArtifacts(
  prev: readonly StationArtifactConfig[],
  next: readonly StationArtifactConfig[],
): ArtifactDiffs {
  const prevKeys = new Set(prev.map(artifactKey));
  const added = next.filter((a) => !prevKeys.has(artifactKey(a)));
  return { added };
}

/** Compute the structural diff between two CatwalkSceneConfig snapshots. */
export function diffCatwalkConfig(prev: CatwalkSceneConfig, next: CatwalkSceneConfig): CatwalkDiff {
  const orchestrator = diffOrchestrator(prev.orchestrator, next.orchestrator);
  const agents = diffAgents(prev.agents, next.agents);
  const gates = diffGates(prev.gates, next.gates);
  const artifacts = diffArtifacts(prev.artifacts, next.artifacts);

  const hasChanges =
    orchestrator.moved !== null ||
    orchestrator.workingChanged !== null ||
    orchestrator.celebratingChanged !== null ||
    orchestrator.waitingChanged !== null ||
    orchestrator.carriedChanged !== null ||
    orchestrator.codeBadgeChanged !== null ||
    agents.stateChanged.length > 0 ||
    agents.added.length > 0 ||
    agents.removed.length > 0 ||
    gates.opened.length > 0 ||
    artifacts.added.length > 0;

  return { orchestrator, agents, gates, artifacts, hasChanges };
}

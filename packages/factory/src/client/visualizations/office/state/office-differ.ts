import type {
  OfficeAgentDiff,
  OfficeAgentState,
  OfficeArtifactDiffs,
  OfficeArtifactState,
  OfficeDiff,
  OfficeOrchestratorDiff,
  OfficeOrchestratorState,
  OfficeSceneConfig,
  OfficeZoneState,
  ZoneDiffEntry,
} from '../types.ts';

/** Compare two orchestrator states and return zone/status/waiting/carried/badge changes. */
function diffOrchestrator(prev: OfficeOrchestratorState, next: OfficeOrchestratorState): OfficeOrchestratorDiff {
  const moved =
    prev.zoneId === next.zoneId && prev.slotId === next.slotId
      ? null
      : { fromZone: prev.zoneId, fromSlot: prev.slotId, toZone: next.zoneId, toSlot: next.slotId };
  const statusChanged = prev.status === next.status ? null : { from: prev.status, to: next.status };
  const waitingChanged = prev.waiting === next.waiting ? null : { from: prev.waiting, to: next.waiting };

  const prevCarried = JSON.stringify(prev.carriedArtifacts);
  const nextCarried = JSON.stringify(next.carriedArtifacts);
  const carriedChanged =
    prevCarried === nextCarried ? null : { from: prev.carriedArtifacts, to: next.carriedArtifacts };

  const prevBadge = prev.codeBadge === null ? null : `${prev.codeBadge.label}:${prev.codeBadge.color}`;
  const nextBadge = next.codeBadge === null ? null : `${next.codeBadge.label}:${next.codeBadge.color}`;
  const codeBadgeChanged = prevBadge === nextBadge ? null : { from: prev.codeBadge, to: next.codeBadge };

  return { moved, statusChanged, waitingChanged, carriedChanged, codeBadgeChanged };
}

/** Compare two agent arrays by ID, detecting status and zone/slot changes. */
function diffAgents(prev: readonly OfficeAgentState[], next: readonly OfficeAgentState[]): OfficeAgentDiff[] {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));
  const diffs: OfficeAgentDiff[] = [];

  for (const [id, nextAgent] of nextById) {
    const prevAgent = prevById.get(id);
    if (prevAgent === undefined) {
      // New agent: report as moved from nowhere
      diffs.push({
        agentId: id,
        statusChanged: null,
        moved: { fromZone: '', fromSlot: '', toZone: nextAgent.zoneId, toSlot: nextAgent.slotId },
      });
      continue;
    }

    const statusChanged =
      prevAgent.status === nextAgent.status ? null : { from: prevAgent.status, to: nextAgent.status };
    const moved =
      prevAgent.zoneId === nextAgent.zoneId && prevAgent.slotId === nextAgent.slotId
        ? null
        : {
            fromZone: prevAgent.zoneId,
            fromSlot: prevAgent.slotId,
            toZone: nextAgent.zoneId,
            toSlot: nextAgent.slotId,
          };

    if (statusChanged !== null || moved !== null) {
      diffs.push({ agentId: id, statusChanged, moved });
    }
  }

  // Removed agents
  for (const [id, prevAgent] of prevById) {
    if (!nextById.has(id)) {
      diffs.push({
        agentId: id,
        statusChanged: null,
        moved: { fromZone: prevAgent.zoneId, fromSlot: prevAgent.slotId, toZone: '', toSlot: '' },
      });
    }
  }

  return diffs;
}

/** Compare two artifact arrays, detecting additions, removals, and status changes. */
function diffArtifacts(
  prev: readonly OfficeArtifactState[],
  next: readonly OfficeArtifactState[],
): OfficeArtifactDiffs {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const nextById = new Map(next.map((a) => [a.id, a]));

  const added: OfficeArtifactState[] = [];
  const removed: OfficeArtifactState[] = [];
  const statusChanged: Array<{ artifactId: string; from: string; to: string }> = [];

  for (const [id, nextArtifact] of nextById) {
    const prevArtifact = prevById.get(id);
    if (prevArtifact === undefined) {
      added.push(nextArtifact);
    } else if (prevArtifact.status !== nextArtifact.status) {
      statusChanged.push({ artifactId: id, from: prevArtifact.status, to: nextArtifact.status });
    }
  }

  for (const [id, prevArtifact] of prevById) {
    if (!nextById.has(id)) {
      removed.push(prevArtifact);
    }
  }

  return { added, removed, statusChanged };
}

/** Compare two zone state arrays, tracking changes to `active` and `completed` fields. */
function diffZones(prev: readonly OfficeZoneState[], next: readonly OfficeZoneState[]): ZoneDiffEntry[] {
  const prevById = new Map(prev.map((z) => [z.id, z]));
  const entries: ZoneDiffEntry[] = [];

  for (const nextZone of next) {
    const prevZone = prevById.get(nextZone.id);
    if (prevZone === undefined) continue;

    if (prevZone.active !== nextZone.active) {
      entries.push({ zoneId: nextZone.id, field: 'active', from: prevZone.active, to: nextZone.active });
    }
    if (prevZone.completed !== nextZone.completed) {
      entries.push({ zoneId: nextZone.id, field: 'completed', from: prevZone.completed, to: nextZone.completed });
    }
  }

  return entries;
}

/** Compute the structural diff between two OfficeSceneConfig snapshots. */
export function diffOfficeConfigs(prev: OfficeSceneConfig, next: OfficeSceneConfig): OfficeDiff {
  const orchestrator = diffOrchestrator(prev.orchestrator, next.orchestrator);
  const agents = diffAgents(prev.agents, next.agents);
  const artifacts = diffArtifacts(prev.artifacts, next.artifacts);
  const zones = diffZones(prev.zones, next.zones);

  const hasChanges =
    orchestrator.moved !== null ||
    orchestrator.statusChanged !== null ||
    orchestrator.waitingChanged !== null ||
    orchestrator.carriedChanged !== null ||
    orchestrator.codeBadgeChanged !== null ||
    agents.length > 0 ||
    artifacts.added.length > 0 ||
    artifacts.removed.length > 0 ||
    artifacts.statusChanged.length > 0 ||
    zones.length > 0;

  return { orchestrator, agents, artifacts, zones, hasChanges };
}

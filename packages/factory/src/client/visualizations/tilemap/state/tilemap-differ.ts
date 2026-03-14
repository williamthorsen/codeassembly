import type {
  AgentDiff,
  ArtifactDiffs,
  OrchestratorDiff,
  ThoughtBubbleConfig,
  ThoughtBubbleDiffs,
  TilemapAgentState,
  TilemapArtifactState,
  TilemapDiff,
  TilemapOrchestratorState,
  TilemapRoomState,
  TilemapSceneConfig,
} from '../types.js';

// ---------------------------------------------------------------------------
// Orchestrator diff
// ---------------------------------------------------------------------------

/** Compare two orchestrator states and return movement, status, waiting, carried, and badge changes. */
function diffOrchestrator(prev: TilemapOrchestratorState, next: TilemapOrchestratorState): OrchestratorDiff {
  const moved = prev.roomId === next.roomId ? null : { fromRoom: prev.roomId, toRoom: next.roomId };

  const statusChanged = prev.status === next.status ? null : { from: prev.status, to: next.status };

  const waitingChanged = prev.waiting === next.waiting ? null : { from: prev.waiting, to: next.waiting };

  const prevCarried = JSON.stringify(prev.carriedArtifacts);
  const nextCarried = JSON.stringify(next.carriedArtifacts);
  const carriedChanged = prevCarried !== nextCarried;

  const prevBadge = prev.codeBadge === null ? null : `${prev.codeBadge.label}:${prev.codeBadge.color}`;
  const nextBadge = next.codeBadge === null ? null : `${next.codeBadge.label}:${next.codeBadge.color}`;
  const codeBadgeChanged = prevBadge !== nextBadge;

  return { moved, statusChanged, waitingChanged, carriedChanged, codeBadgeChanged };
}

// ---------------------------------------------------------------------------
// Agent diffs
// ---------------------------------------------------------------------------

/** Compare two agent arrays by id, detecting status and slot changes. */
function diffAgents(prev: readonly TilemapAgentState[], next: readonly TilemapAgentState[]): AgentDiff[] {
  const prevById = new Map(prev.map((a) => [a.id, a]));
  const diffs: AgentDiff[] = [];

  for (const nextAgent of next) {
    const prevAgent = prevById.get(nextAgent.id);

    if (prevAgent === undefined) {
      // New agent — report its current status as a change from itself (signals appearance)
      diffs.push({
        agentId: nextAgent.id,
        statusChanged: { from: nextAgent.status, to: nextAgent.status },
        slotChanged: null,
      });
      continue;
    }

    const statusChanged =
      prevAgent.status === nextAgent.status ? null : { from: prevAgent.status, to: nextAgent.status };

    const slotChanged =
      prevAgent.slotId === nextAgent.slotId ? null : { fromSlot: prevAgent.slotId, toSlot: nextAgent.slotId };

    if (statusChanged !== null || slotChanged !== null) {
      diffs.push({ agentId: nextAgent.id, statusChanged, slotChanged });
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Artifact diffs
// ---------------------------------------------------------------------------

/** Compare two artifact arrays by id, detecting additions and status changes. */
function diffArtifacts(prev: readonly TilemapArtifactState[], next: readonly TilemapArtifactState[]): ArtifactDiffs {
  const prevById = new Map(prev.map((a) => [a.id, a]));

  const added: TilemapArtifactState[] = [];
  const statusChanged: ArtifactDiffs['statusChanged'] = [];

  for (const nextArtifact of next) {
    const prevArtifact = prevById.get(nextArtifact.id);

    if (prevArtifact === undefined) {
      added.push(nextArtifact);
    } else if (prevArtifact.status !== nextArtifact.status) {
      statusChanged.push({
        id: nextArtifact.id,
        from: prevArtifact.status,
        to: nextArtifact.status,
      });
    }
  }

  return { added, statusChanged };
}

// ---------------------------------------------------------------------------
// Thought bubble diffs
// ---------------------------------------------------------------------------

/** Serialize thought bubble texts for comparison. */
function serializeTexts(bubble: ThoughtBubbleConfig): string {
  return JSON.stringify(bubble.texts);
}

/** Compare two thought bubble arrays by agentId, detecting additions, removals, and text updates. */
function diffThoughtBubbles(
  prev: readonly ThoughtBubbleConfig[],
  next: readonly ThoughtBubbleConfig[],
): ThoughtBubbleDiffs {
  const prevById = new Map(prev.map((b) => [b.agentId, b]));
  const nextById = new Map(next.map((b) => [b.agentId, b]));

  const updated: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [agentId, nextBubble] of nextById) {
    const prevBubble = prevById.get(agentId);
    if (prevBubble === undefined) {
      added.push(agentId);
    } else if (serializeTexts(prevBubble) !== serializeTexts(nextBubble)) {
      updated.push(agentId);
    }
  }

  for (const agentId of prevById.keys()) {
    if (!nextById.has(agentId)) {
      removed.push(agentId);
    }
  }

  return { updated, added, removed };
}

// ---------------------------------------------------------------------------
// Room diffs
// ---------------------------------------------------------------------------

/** Fields tracked for room-level diffing. */
const ROOM_DIFF_FIELDS = ['active', 'completed', 'hasAlerts'] as const;

/** Compare two room arrays by id, detecting changes in active, completed, and hasAlerts fields. */
function diffRooms(
  prev: readonly TilemapRoomState[],
  next: readonly TilemapRoomState[],
): Array<{ roomId: string; field: string; from: unknown; to: unknown }> {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const diffs: Array<{ roomId: string; field: string; from: unknown; to: unknown }> = [];

  for (const nextRoom of next) {
    const prevRoom = prevById.get(nextRoom.id);
    if (prevRoom === undefined) {
      continue;
    }

    for (const field of ROOM_DIFF_FIELDS) {
      if (prevRoom[field] !== nextRoom[field]) {
        diffs.push({ roomId: nextRoom.id, field, from: prevRoom[field], to: nextRoom[field] });
      }
    }
  }

  return diffs;
}

// ---------------------------------------------------------------------------
// Top-level differ
// ---------------------------------------------------------------------------

/** Compute the structural diff between two TilemapSceneConfig snapshots. */
export function diffTilemapConfigs(prev: TilemapSceneConfig, next: TilemapSceneConfig): TilemapDiff {
  const orchestrator = diffOrchestrator(prev.orchestrator, next.orchestrator);
  const agents = diffAgents(prev.agents, next.agents);
  const artifacts = diffArtifacts(prev.artifacts, next.artifacts);
  const thoughtBubbles = diffThoughtBubbles(prev.thoughtBubbles, next.thoughtBubbles);
  const rooms = diffRooms(prev.rooms, next.rooms);

  const hasChanges =
    orchestrator.moved !== null ||
    orchestrator.statusChanged !== null ||
    orchestrator.waitingChanged !== null ||
    orchestrator.carriedChanged ||
    orchestrator.codeBadgeChanged ||
    agents.length > 0 ||
    artifacts.added.length > 0 ||
    artifacts.statusChanged.length > 0 ||
    thoughtBubbles.updated.length > 0 ||
    thoughtBubbles.added.length > 0 ||
    thoughtBubbles.removed.length > 0 ||
    rooms.length > 0;

  return { orchestrator, agents, artifacts, thoughtBubbles, rooms, hasChanges };
}

import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';
import type { CarriedArtifact, CodeBadge } from '../shared/orchestrator-utils.js';

// ---------------------------------------------------------------------------
// Severity — derived from Criticality in run data
// ---------------------------------------------------------------------------

/**
 * Visual severity level for thought bubble border coloring.
 *
 * Maps from the run data's `Criticality` type:
 * - `'none'` | `'low'` -> `'normal'` (no special border)
 * - `'medium'` -> `'warning'` (amber border)
 * - `'high'` -> `'critical'` (red border)
 */
export type ThoughtBubbleSeverity = 'normal' | 'warning' | 'critical';

// ---------------------------------------------------------------------------
// Thought bubble text categories
// ---------------------------------------------------------------------------

/**
 * Category of content displayed in a thought bubble.
 *
 * - `'task'` — what the agent is currently doing (e.g., "Analyzing architectural impact...")
 * - `'progress'` — quantitative progress summary (e.g., "+142 -38 across 4 files")
 * - `'finding'` — review finding summary (e.g., "Found W: missing null check")
 * - `'waiting'` — blocking dependency (e.g., "Waiting for implementation to complete")
 * - `'idle'` — agent has not started yet (e.g., "Standing by...")
 */
export type ThoughtBubbleCategory = 'task' | 'progress' | 'finding' | 'waiting' | 'idle';

// ---------------------------------------------------------------------------
// Thought bubble text item
// ---------------------------------------------------------------------------

/** A single piece of cycling content within a thought bubble. */
export interface ThoughtBubbleText {
  /** The display text shown in the bubble. */
  content: string;
  /** The category of this text, used to style the text or icon. */
  category: ThoughtBubbleCategory;
}

// ---------------------------------------------------------------------------
// Thought bubble config — one per agent
// ---------------------------------------------------------------------------

/** Configuration for a single agent's thought bubble in the tilemap scene. */
export interface ThoughtBubbleConfig {
  /** Unique identifier for the agent (e.g., "arch", "coder", "reviewer-0"). */
  agentId: string;
  /** Human-readable role name (e.g., "architect", "coder", "correctness-reviewer"). */
  agentRole: string;
  /** The role type, used for color theming. */
  roleType: RoleType;
  /** The phase this agent belongs to. */
  phase: PhaseName;
  /** Cycling text content displayed in the bubble (rotates every 4-6 seconds). */
  texts: ThoughtBubbleText[];
  /** Visual severity for border coloring, derived from highest criticality. */
  severity: ThoughtBubbleSeverity;
  /** Stagger offset in milliseconds — delay before this bubble starts its cycling. */
  staggerOffsetMs: number;
}

// ---------------------------------------------------------------------------
// Spatial primitives
// ---------------------------------------------------------------------------

/** Tile-space coordinate. */
export interface TileCoord {
  tileX: number;
  tileY: number;
}

/** Tile-space bounding box. */
export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Direction an agent faces at a slot. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Slot type within a room. */
export type SlotType = 'workstation' | 'display' | 'storage' | 'gathering';

// ---------------------------------------------------------------------------
// Room definitions (spatial containers — no pipeline knowledge)
// ---------------------------------------------------------------------------

/** A named position within a room where an agent or artifact can be placed. */
export interface SlotDefinition {
  id: string;
  position: TileCoord;
  type: SlotType;
  facing: Direction;
}

/** A doorway connecting a room to a corridor. */
export interface DoorDefinition {
  position: TileCoord;
  side: 'top' | 'bottom' | 'left' | 'right';
}

/** A room in the facility. Defines geometry and slots, not pipeline semantics. */
export interface RoomDefinition {
  id: string;
  label: string;
  bounds: TileRect;
  doors: DoorDefinition[];
  slots: SlotDefinition[];
}

// ---------------------------------------------------------------------------
// Facility layout (composed rooms + corridor graph)
// ---------------------------------------------------------------------------

/** Pixel-space position. */
export interface Position {
  x: number;
  y: number;
}

/** Lookup interface for facility spatial queries. */
export interface FacilityLayout {
  rooms: Record<string, RoomDefinition>;

  /** Pixel position for a named slot. */
  slotPosition(slotId: string): Position;

  /** Pixel center of a room. */
  roomCenter(roomId: string): Position;

  /** All slot IDs in a room, optionally filtered by type. */
  slotsInRoom(roomId: string, type?: SlotType): string[];

  /** Corridor waypoint path between two rooms (pixel coordinates). */
  corridorPath(fromRoomId: string, toRoomId: string): Position[];
}

// ---------------------------------------------------------------------------
// Agent state (derived from run data, independent of position)
// ---------------------------------------------------------------------------

/** Lifecycle status for a non-orchestrator agent. */
export type AgentStatus = 'idle' | 'working' | 'done' | 'blocked' | 'concerned';

/** Lifecycle status for the orchestrator. */
export type OrchestratorStatus = 'idle' | 'dispatching' | 'monitoring' | 'delivering' | 'done';

/** State of a non-orchestrator agent. */
export interface TilemapAgentState {
  id: string;
  role: string;
  roleType: RoleType;
  status: AgentStatus;
  roomId: string;
  slotId: string;
}

/** State of the orchestrator. */
export interface TilemapOrchestratorState {
  roomId: string;
  status: OrchestratorStatus;
  carriedArtifacts: CarriedArtifact[];
  codeBadge: CodeBadge | null;
  waiting: boolean;
}

// ---------------------------------------------------------------------------
// Artifact state
// ---------------------------------------------------------------------------

/** Lifecycle status for an artifact. */
export type ArtifactStatus = 'on_desk' | 'delivered';

/** State of an artifact in the facility. */
export interface TilemapArtifactState {
  id: string;
  label: string;
  color: string;
  status: ArtifactStatus;
  roomId: string;
  slotId: string;
  side: 'input' | 'output';
  version?: number;
}

// ---------------------------------------------------------------------------
// Room state (derived from agent assignments)
// ---------------------------------------------------------------------------

/** Visual state of a room, derived from the agents assigned to it. */
export interface TilemapRoomState {
  id: string;
  active: boolean;
  completed: boolean;
  hasAlerts: boolean;
}

// ---------------------------------------------------------------------------
// Scene config (full state snapshot — output of the state mapper)
// ---------------------------------------------------------------------------

/** Complete logical state of the tilemap visualization at a point in time. */
export interface TilemapSceneConfig {
  rooms: TilemapRoomState[];
  orchestrator: TilemapOrchestratorState;
  agents: TilemapAgentState[];
  artifacts: TilemapArtifactState[];
  thoughtBubbles: ThoughtBubbleConfig[];
}

// ---------------------------------------------------------------------------
// Diff types (output of the differ)
// ---------------------------------------------------------------------------

export interface OrchestratorDiff {
  moved: { fromRoom: string; toRoom: string } | null;
  statusChanged: { from: OrchestratorStatus; to: OrchestratorStatus } | null;
  waitingChanged: { from: boolean; to: boolean } | null;
  carriedChanged: boolean;
  codeBadgeChanged: boolean;
}

export interface AgentDiff {
  agentId: string;
  statusChanged: { from: AgentStatus; to: AgentStatus } | null;
  slotChanged: { fromSlot: string; toSlot: string } | null;
}

export interface ArtifactDiffs {
  added: TilemapArtifactState[];
  statusChanged: Array<{ id: string; from: ArtifactStatus; to: ArtifactStatus }>;
}

export interface ThoughtBubbleDiffs {
  updated: string[];
  added: string[];
  removed: string[];
}

export interface TilemapDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiff[];
  artifacts: ArtifactDiffs;
  thoughtBubbles: ThoughtBubbleDiffs;
  rooms: Array<{ roomId: string; field: string; from: unknown; to: unknown }>;
  hasChanges: boolean;
}

// ---------------------------------------------------------------------------
// Resolved positions (output of the position resolver)
// ---------------------------------------------------------------------------

export interface ResolvedPosition {
  entityId: string;
  x: number;
  y: number;
  facing?: Direction;
}

export interface ResolvedPositions {
  orchestrator: ResolvedPosition;
  agents: ResolvedPosition[];
  artifacts: ResolvedPosition[];
}

// ---------------------------------------------------------------------------
// Transition types (output of the transition planner)
// ---------------------------------------------------------------------------

export type TransitionType = 'walk' | 'state_change' | 'fade_in' | 'fade_out' | 'artifact_appear' | 'artifact_deliver';

export interface Transition {
  entityId: string;
  type: TransitionType;
  from?: Position;
  to?: Position;
  path?: Position[];
  durationMs: number;
  delayMs: number;
}

export interface TransitionPlan {
  transitions: Transition[];
  totalDurationMs: number;
}

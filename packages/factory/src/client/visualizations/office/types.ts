import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';
import type { CarriedArtifact, CodeBadge } from '../shared/orchestrator-utils.js';
import type { AgentStatus, ArtifactStatus, OrchestratorStatus } from '../shared/types.js';

// -- Spatial primitives --

/** Tile-space coordinate (column, row). */
export interface TileCoord {
  col: number;
  row: number;
}

/** Tile-space axis-aligned rectangle. */
export interface TileRect {
  col: number;
  row: number;
  width: number;
  height: number;
}

/** Cardinal direction for pathfinding and facing. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Semantic role of a slot within a zone. */
export type SlotType = 'workstation' | 'storage' | 'standing';

/** A named position within a zone where an entity can be placed. */
export interface SlotDefinition {
  id: string;
  type: SlotType;
  tile: TileCoord;
  facing?: Direction;
}

/** A doorway connecting a zone to the corridor system. */
export interface DoorDefinition {
  tile: TileCoord;
  direction: Direction;
}

/** Spatial definition of a named zone with bounds, slots, and doorways. */
export interface ZoneDefinition {
  id: string;
  label: string;
  bounds: TileRect;
  slots: SlotDefinition[];
  doors: DoorDefinition[];
}

// -- Pixel-space position --

/** Pixel-space position. */
export interface Position {
  x: number;
  y: number;
}

// -- Facility layout query API --

/** Query interface for the spatial layout consumed by downstream layers. */
export interface FacilityLayout {
  /** Return pixel position for a given slot ID. */
  slotPosition(slotId: string): Position;
  /** Return pixel center of a zone. */
  zoneCenter(zoneId: string): Position;
  /** Return all slots in a zone, optionally filtered by slot type. */
  slotsInZone(zoneId: string, type?: SlotType): SlotDefinition[];
  /** Return corridor waypoints between two zones (directional). */
  corridorPath(fromZoneId: string, toZoneId: string): Position[];
  /** Return the slot definition for a given slot ID, or undefined if not found. */
  slotDefinition(slotId: string): SlotDefinition | undefined;
  /** All zone definitions. */
  zones: readonly ZoneDefinition[];
}

// -- Office scene config (spatial layer output) --

/** Spatial configuration for the office visualization. */
export interface OfficeSceneConfig {
  orchestrator: OfficeOrchestratorState;
  agents: OfficeAgentState[];
  artifacts: OfficeArtifactState[];
  zones: OfficeZoneState[];
}

/** Agent state with spatial assignment. */
export interface OfficeAgentState {
  id: string;
  role: string;
  roleType: RoleType;
  phase: PhaseName;
  status: AgentStatus;
  zoneId: string;
  slotId: string;
}

/** Orchestrator state with spatial assignment. */
export interface OfficeOrchestratorState {
  status: OrchestratorStatus;
  carriedArtifacts: CarriedArtifact[];
  codeBadge: CodeBadge | null;
  waiting: boolean;
  zoneId: string;
  slotId: string;
}

/** Artifact state with spatial assignment. */
export interface OfficeArtifactState {
  id: string;
  label: string;
  color: string;
  status: ArtifactStatus;
  producerPhase: PhaseName;
  zoneId: string;
  slotId: string;
}

/** Aggregate state of a zone derived from the agents within it. */
export interface OfficeZoneState {
  id: string;
  active: boolean;
  completed: boolean;
}

// region | Diff types

/** Describes a single field change on a zone. */
export interface ZoneDiffEntry {
  zoneId: string;
  field: string;
  from: unknown;
  to: unknown;
}

/** Orchestrator-level diff fields. */
export interface OfficeOrchestratorDiff {
  moved: { fromZone: string; fromSlot: string; toZone: string; toSlot: string } | null;
  statusChanged: { from: string; to: string } | null;
  waitingChanged: { from: boolean; to: boolean } | null;
  carriedChanged: {
    from: CarriedArtifact[];
    to: CarriedArtifact[];
  } | null;
  codeBadgeChanged: {
    from: CodeBadge | null;
    to: CodeBadge | null;
  } | null;
}

/** Agent-level diff fields. */
export interface OfficeAgentDiff {
  agentId: string;
  statusChanged: { from: string; to: string } | null;
  moved: { fromZone: string; fromSlot: string; toZone: string; toSlot: string } | null;
}

/** Artifact-level diff fields. */
export interface OfficeArtifactDiffs {
  added: OfficeArtifactState[];
  removed: OfficeArtifactState[];
  statusChanged: Array<{ artifactId: string; from: string; to: string }>;
}

/** Structural diff between two OfficeSceneConfig snapshots. */
export interface OfficeDiff {
  orchestrator: OfficeOrchestratorDiff;
  agents: OfficeAgentDiff[];
  artifacts: OfficeArtifactDiffs;
  zones: ZoneDiffEntry[];
  hasChanges: boolean;
}

// endregion | Diff types

// -- Resolved positions (pixel-space output) --

/** Pixel-space positions for all entities in a scene snapshot. */
export interface ResolvedPositions {
  agents: Map<string, Position>;
  artifacts: Map<string, Position>;
  orchestrator: Position;
}

// region | Transition plan types

/** Transition action type. */
export type TransitionType = 'walk' | 'state_change' | 'fade_in' | 'fade_out' | 'artifact_appear' | 'artifact_deliver';

/** A single transition instruction for the rendering layer. */
export interface Transition {
  type: TransitionType;
  entityId: string;
  entityKind: 'agent' | 'orchestrator' | 'artifact';
  delayMs: number;
  waypoints?: Position[];
  from?: unknown;
  to?: unknown;
}

/** Entity kind discriminator extracted from Transition. */
export type EntityKind = Transition['entityKind'];

/** Ordered list of transitions to apply. */
export interface TransitionPlan {
  transitions: Transition[];
}

// Re-export visualization-agnostic status types from shared
export { type CarriedArtifact, type CodeBadge } from '../shared/orchestrator-utils.js';
export { type AgentStatus, type ArtifactStatus, type OrchestratorStatus } from '../shared/types.js';

// endregion | Transition plan types

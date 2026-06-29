import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';

/**
 * Animation states for factory-floor agents. Shared with the catwalk visualization
 * since both use the same sprite system.
 */
export type AgentAnimationState =
  'idle' | 'working' | 'walking' | 'resting' | 'celebrating' | 'concerned' | 'deactivated';

/** The three vertical zones in the factory-floor layout. */
export type Zone = 'upper' | 'rail' | 'lower';

export interface FactoryFloorSceneConfig {
  orchestrator: OrchestratorConfig;
  stations: StationConfig[];
  agents: AgentConfig[];
  artifacts: StationArtifactConfig[];
}

export interface OrchestratorConfig {
  stationIndex: number;
  working: boolean;
  celebrating: boolean;
  carriedArtifacts: CarriedArtifactConfig[];
  codeBadge: { label: string; color: string } | null;
}

export interface StationConfig {
  phase: PhaseName;
  label: string;
  color: string;
  absent: boolean;
  skipped: boolean;
}

export interface AgentConfig {
  id: string;
  role: string;
  roleType: RoleType;
  stationIndex: number;
  slotIndex: number;
  state: AgentAnimationState;
}

export interface StationArtifactConfig {
  stationIndex: number;
  agentSlotIndex: number;
  label: string;
  color: string;
  slot: 'input' | 'output';
  version?: number;
}

export interface CarriedArtifactConfig {
  label: string;
  color: string;
}

// region | Diff types

export interface OrchestratorDiff {
  moved: { from: number; to: number } | null;
  workingChanged: { from: boolean; to: boolean } | null;
  celebratingChanged: { from: boolean; to: boolean } | null;
  carriedChanged: { from: CarriedArtifactConfig[]; to: CarriedArtifactConfig[] } | null;
  codeBadgeChanged: { from: OrchestratorConfig['codeBadge']; to: OrchestratorConfig['codeBadge'] } | null;
}

export interface AgentStateDiff {
  agentId: string;
  from: AgentAnimationState;
  to: AgentAnimationState;
}

export interface AgentDiffs {
  stateChanged: AgentStateDiff[];
  added: AgentConfig[];
  removed: AgentConfig[];
}

export interface ArtifactDiffs {
  added: StationArtifactConfig[];
}

export interface FactoryFloorDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiffs;
  artifacts: ArtifactDiffs;
  hasChanges: boolean;
}

// endregion | Diff types

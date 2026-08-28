import type { PhaseName, RoleType } from 'codeassembly-run-core';

/**
 * Animation states for catwalk agents. Intentionally duplicated from
 * `sprite-definitions.ts` so that the catwalk mapper has no dependency
 * on the Excalibur game layer.
 */
export type AgentAnimationState =
  'idle' | 'working' | 'walking' | 'resting' | 'celebrating' | 'concerned' | 'deactivated';

export interface CatwalkSceneConfig {
  orchestrator: OrchestratorConfig;
  stations: StationConfig[];
  agents: AgentConfig[];
  gates: GateConfig[];
  artifacts: StationArtifactConfig[];
}

export interface OrchestratorConfig {
  stationIndex: number;
  working: boolean;
  celebrating: boolean;
  waiting: boolean;
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

export interface GateConfig {
  betweenStations: [number, number];
  open: boolean;
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

// region | Diff types — produced by catwalk-differ.ts

export interface OrchestratorDiff {
  moved: { from: number; to: number } | null;
  workingChanged: { from: boolean; to: boolean } | null;
  celebratingChanged: { from: boolean; to: boolean } | null;
  waitingChanged: { from: boolean; to: boolean } | null;
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

export interface GateDiffs {
  opened: GateConfig[];
}

export interface ArtifactDiffs {
  added: StationArtifactConfig[];
}

export interface CatwalkDiff {
  orchestrator: OrchestratorDiff;
  agents: AgentDiffs;
  gates: GateDiffs;
  artifacts: ArtifactDiffs;
  hasChanges: boolean;
}

// endregion | Diff types — produced by catwalk-differ.ts

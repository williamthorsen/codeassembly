import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';

/**
 * Animation states for catwalk agents. Intentionally duplicated from
 * `sprite-definitions.ts` so that the catwalk mapper has no dependency
 * on the Excalibur game layer.
 */
export type AgentAnimationState = 'idle' | 'working' | 'walking' | 'resting' | 'celebrating' | 'concerned';

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
  label: string;
  color: string;
  slot: 'input' | 'output';
  version?: number;
}

export interface CarriedArtifactConfig {
  label: string;
  color: string;
}

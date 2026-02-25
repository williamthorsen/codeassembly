import type { CanonicalRunStatus, Phases } from '../../../shared/types/canonical.js';

export interface StationConfig {
  phase: string;
  active: boolean;
}

export interface GateConfig {
  open: boolean;
}

export interface AgentConfig {
  role: string;
  stationIndex: number;
}

export interface ArtifactConfig {
  type: string;
  stationIndex: number;
}

export interface SceneConfig {
  stations: StationConfig[];
  gates: GateConfig[];
  agents: AgentConfig[];
  artifacts: ArtifactConfig[];
}

export const PHASE_NAMES = ['architecture', 'planning', 'implementation', 'review', 'simplifier', 'holistic', 'summary'] as const;

function isPhaseActive(phase: string, phases: Phases, runStatus: string): boolean {
  switch (phase) {
    case 'architecture':
      return phases.architecture !== undefined;
    case 'planning':
      return phases.planning !== undefined;
    case 'implementation':
      return phases.implementation !== undefined;
    case 'review':
      return (phases.parallelReview ?? phases.review) !== undefined;
    case 'simplifier':
      return phases.codeSimplifier?.ran === true;
    case 'holistic':
      return phases.holisticReview !== undefined;
    case 'summary':
      return runStatus === 'completed';
    default:
      return false;
  }
}

function buildStations(status: CanonicalRunStatus): StationConfig[] {
  return PHASE_NAMES.map((phase) => ({
    phase,
    active: isPhaseActive(phase, status.phases, status.status),
  }));
}

function buildGates(stations: StationConfig[]): GateConfig[] {
  return PHASE_NAMES.slice(0, -1).map((_phase, i) => ({
    open: (stations[i]?.active && stations[i + 1]?.active) === true,
  }));
}

function buildAgents(phases: Phases): AgentConfig[] {
  const agents: AgentConfig[] = [];
  if (phases.architecture !== undefined) agents.push({ role: 'architect', stationIndex: 0 });
  if (phases.planning !== undefined) agents.push({ role: 'planner', stationIndex: 1 });
  if (phases.implementation !== undefined) agents.push({ role: 'coder', stationIndex: 2 });
  if ((phases.parallelReview ?? phases.review) !== undefined) {
    agents.push({ role: 'reviewer', stationIndex: 3 });
  }
  return agents;
}

function buildArtifacts(phases: Phases): ArtifactConfig[] {
  const artifacts: ArtifactConfig[] = [];
  if (phases.architecture?.artifact !== undefined) artifacts.push({ type: 'architecture', stationIndex: 0 });
  if ((phases.planning?.artifacts?.length ?? 0) > 0) artifacts.push({ type: 'plan', stationIndex: 1 });
  if (phases.implementation?.artifact !== undefined) artifacts.push({ type: 'code', stationIndex: 2 });
  return artifacts;
}

export function createSceneConfig(status: CanonicalRunStatus): SceneConfig {
  const stations = buildStations(status);
  const gates = buildGates(stations);
  const agents = buildAgents(status.phases);
  const artifacts = buildArtifacts(status.phases);

  return { stations, gates, agents, artifacts };
}

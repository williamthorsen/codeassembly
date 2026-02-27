import type { RoleType } from '../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE_TYPE } from '../../../shared/constants/role-types.js';
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
  roleType: RoleType;
  stationIndex: number;
  stackOffset: number;
  level: number;
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

export { PHASE_NAMES } from '../../../shared/constants/role-types.js';

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
  const gates: GateConfig[] = [];
  let prev: StationConfig | undefined;
  for (const station of stations) {
    if (prev !== undefined) {
      gates.push({ open: prev.active && station.active });
    }
    prev = station;
  }
  return gates;
}

/**
 * Find the station index of the rightmost active phase during an in-progress run.
 * Returns undefined if no phases are active, which causes no orchestrator agent
 * to be created by buildOrchestratorAgent.
 */
function findOrchestratorStation(phases: Phases, runStatus: string): number | undefined {
  for (let i = PHASE_NAMES.length - 1; i >= 0; i--) {
    const phase = PHASE_NAMES[i];
    if (phase !== undefined && isPhaseActive(phase, phases, runStatus)) {
      return i;
    }
  }
  return undefined;
}

function buildReviewerAgents(phases: Phases): AgentConfig[] {
  if (phases.parallelReview !== undefined) {
    const reviewerEntries = Object.entries(phases.parallelReview.reviewers);
    if (reviewerEntries.length > 0) {
      return reviewerEntries.map(([name], i) => ({
        role: name,
        roleType: PHASE_ROLE_TYPE.review,
        stationIndex: 3,
        stackOffset: i,
        level: i,
      }));
    }
    return [{ role: 'reviewer', roleType: PHASE_ROLE_TYPE.review, stationIndex: 3, stackOffset: 0, level: 0 }];
  }
  if (phases.review !== undefined) {
    return [{ role: 'reviewer', roleType: PHASE_ROLE_TYPE.review, stationIndex: 3, stackOffset: 0, level: 0 }];
  }
  return [];
}

function buildOrchestratorAgent(phases: Phases, runStatus: string, agents: AgentConfig[]): AgentConfig | undefined {
  if (runStatus === 'completed') {
    return { role: 'orchestrator', roleType: PHASE_ROLE_TYPE.summary, stationIndex: 6, stackOffset: 0, level: 0 };
  }
  if (runStatus === 'in_progress') {
    const station = findOrchestratorStation(phases, runStatus);
    if (station !== undefined) {
      const existingAtStation = agents.filter((a) => a.stationIndex === station).length;
      return {
        role: 'orchestrator',
        roleType: PHASE_ROLE_TYPE.summary,
        stationIndex: station,
        stackOffset: existingAtStation,
        level: 0,
      };
    }
  }
  return undefined;
}

function buildAgents(phases: Phases, runStatus: string): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (phases.architecture !== undefined) {
    agents.push({
      role: 'architect',
      roleType: PHASE_ROLE_TYPE.architecture,
      stationIndex: 0,
      stackOffset: 0,
      level: 0,
    });
  }

  if (phases.planning !== undefined) {
    agents.push({ role: 'planner', roleType: PHASE_ROLE_TYPE.planning, stationIndex: 1, stackOffset: 0, level: 0 });
  }

  if (phases.implementation !== undefined) {
    agents.push({ role: 'coder', roleType: PHASE_ROLE_TYPE.implementation, stationIndex: 2, stackOffset: 0, level: 0 });
  }

  agents.push(...buildReviewerAgents(phases));

  if (phases.codeSimplifier?.ran === true) {
    agents.push({
      role: 'simplifier',
      roleType: PHASE_ROLE_TYPE.simplifier,
      stationIndex: 4,
      stackOffset: 0,
      level: 0,
    });
  }

  if (phases.holisticReview !== undefined) {
    agents.push({
      role: 'holistic-reviewer',
      roleType: PHASE_ROLE_TYPE.holistic,
      stationIndex: 5,
      stackOffset: 0,
      level: 0,
    });
  }

  const orchestrator = buildOrchestratorAgent(phases, runStatus, agents);
  if (orchestrator !== undefined) {
    agents.push(orchestrator);
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
  const agents = buildAgents(status.phases, status.status);
  const artifacts = buildArtifacts(status.phases);

  return { stations, gates, agents, artifacts };
}

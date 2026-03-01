import type { PhaseName, RoleType } from '../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE } from '../../../shared/constants/role-types.js';
import { findCurrentPhase, isPhasePresentInData } from '../../../shared/phase-inference.js';
import type { CanonicalRunStatus, Phases } from '../../../shared/types/canonical.js';

export interface StationConfig {
  phase: string;
  role: string;
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
  approaching?: boolean;
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

/**
 * The Phases type uses `| undefined` but runtime data from Zod can carry `null`
 * phase values. This helper handles both cases while satisfying the eqeqeq lint rule.
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

function isPhaseActive(phase: PhaseName, phases: Phases, runStatus: string, currentPhase?: PhaseName): boolean {
  if (phase === currentPhase) return true;
  if (phase === 'summary') return runStatus === 'completed';
  return isPhasePresentInData(phase, phases);
}

function buildStations(status: CanonicalRunStatus, currentPhase?: PhaseName): StationConfig[] {
  return PHASE_NAMES.map((phase) => ({
    phase,
    role: PHASE_ROLE[phase],
    active: isPhaseActive(phase, status.phases, status.status, currentPhase),
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
 *
 * The `currentPhase` is passed through to `isPhaseActive` so that the inferred
 * current phase is considered active during the right-to-left scan. This ensures
 * the orchestrator positions at the frontier of activity, not at the rightmost
 * completed phase.
 */
function findOrchestratorStation(phases: Phases, runStatus: string, currentPhase?: PhaseName): number | undefined {
  for (let i = PHASE_NAMES.length - 1; i >= 0; i--) {
    const phase = PHASE_NAMES[i];
    if (phase !== undefined && isPhaseActive(phase, phases, runStatus, currentPhase)) {
      return i;
    }
  }
  return undefined;
}

function buildReviewerAgents(phases: Phases): AgentConfig[] {
  if (isPresent(phases.parallelReview)) {
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
  if (isPresent(phases.review)) {
    return [{ role: 'reviewer', roleType: PHASE_ROLE_TYPE.review, stationIndex: 3, stackOffset: 0, level: 0 }];
  }
  return [];
}

/**
 * Review station index (0-based). Kept in sync with REVIEW_STATION_INDEX in
 * platform-layout.ts. Defined locally to avoid a mapper -> layout dependency.
 * Exported for test verification that this stays in sync with the layout constant.
 */
export const REVIEW_STATION_INDEX = 3;

/**
 * Determine which level the orchestrator should occupy at a given station.
 *
 * When at the review station with multiple reviewers, the orchestrator goes to
 * the highest reviewer level (reviewerCount - 1) to visually "supervise" from above.
 * With 0 or 1 reviewer, all agents are on level 0 (no upper platforms), so the
 * orchestrator stays on level 0.
 */
function computeOrchestratorLevel(station: number, phases: Phases): number {
  if (station !== REVIEW_STATION_INDEX) return 0;
  const reviewerCount = Object.keys(phases.parallelReview?.reviewers ?? {}).length;
  return reviewerCount > 1 ? reviewerCount - 1 : 0;
}

function buildOrchestratorAgent(phases: Phases, runStatus: string, currentPhase?: PhaseName): AgentConfig | undefined {
  if (runStatus === 'completed') {
    return { role: 'orchestrator', roleType: PHASE_ROLE_TYPE.summary, stationIndex: 6, stackOffset: 0, level: 0 };
  }
  if (runStatus === 'in_progress') {
    const station = findOrchestratorStation(phases, runStatus, currentPhase);
    if (station !== undefined) {
      const orchestratorLevel = computeOrchestratorLevel(station, phases);
      return {
        role: 'orchestrator',
        roleType: PHASE_ROLE_TYPE.summary,
        stationIndex: station,
        stackOffset: 0,
        approaching: true,
        level: orchestratorLevel,
      };
    }
  }
  return undefined;
}

/**
 * Build review agents, handling the case where the review phase is inferred as
 * current but no review data exists yet. In that case, a single generic reviewer
 * agent is created instead of calling `buildReviewerAgents` (which returns `[]`
 * when neither `parallelReview` nor `review` is set).
 */
function buildReviewAgentsWithInference(phases: Phases, currentPhase?: PhaseName): AgentConfig[] {
  if (currentPhase === 'review' && phases.parallelReview === undefined && phases.review === undefined) {
    return [
      {
        role: 'reviewer',
        roleType: PHASE_ROLE_TYPE.review,
        stationIndex: REVIEW_STATION_INDEX,
        stackOffset: 0,
        level: 0,
      },
    ];
  }
  return buildReviewerAgents(phases);
}

/** Check whether a phase should produce an agent based on existing data or inference. */
function shouldShowPhaseAgent(phase: PhaseName, phases: Phases, currentPhase?: PhaseName): boolean {
  if (currentPhase === phase) return true;
  return isPhasePresentInData(phase, phases);
}

/** Build the list of phase-level agents (non-orchestrator) for a given run. */
function buildPhaseAgents(phases: Phases, currentPhase?: PhaseName): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (shouldShowPhaseAgent('architecture', phases, currentPhase)) {
    agents.push({
      role: 'architect',
      roleType: PHASE_ROLE_TYPE.architecture,
      stationIndex: 0,
      stackOffset: 0,
      level: 0,
    });
  }

  if (shouldShowPhaseAgent('planning', phases, currentPhase)) {
    agents.push({ role: 'planner', roleType: PHASE_ROLE_TYPE.planning, stationIndex: 1, stackOffset: 0, level: 0 });
  }

  if (shouldShowPhaseAgent('implementation', phases, currentPhase)) {
    agents.push({ role: 'coder', roleType: PHASE_ROLE_TYPE.implementation, stationIndex: 2, stackOffset: 0, level: 0 });
  }

  agents.push(...buildReviewAgentsWithInference(phases, currentPhase));

  if (shouldShowPhaseAgent('simplifier', phases, currentPhase)) {
    agents.push({
      role: 'simplifier',
      roleType: PHASE_ROLE_TYPE.simplifier,
      stationIndex: 4,
      stackOffset: 0,
      level: 0,
    });
  }

  if (shouldShowPhaseAgent('holistic', phases, currentPhase)) {
    agents.push({
      role: 'holistic-reviewer',
      roleType: PHASE_ROLE_TYPE.holistic,
      stationIndex: 5,
      stackOffset: 0,
      level: 0,
    });
  }

  return agents;
}

function buildAgents(phases: Phases, runStatus: string, currentPhase?: PhaseName): AgentConfig[] {
  const agents = buildPhaseAgents(phases, currentPhase);

  const orchestrator = buildOrchestratorAgent(phases, runStatus, currentPhase);
  if (orchestrator !== undefined) {
    agents.push(orchestrator);
  }

  return agents;
}

function buildArtifacts(phases: Phases): ArtifactConfig[] {
  const artifacts: ArtifactConfig[] = [];
  if (isPresent(phases.architecture?.artifact)) artifacts.push({ type: 'architecture', stationIndex: 0 });
  if ((phases.planning?.artifacts?.length ?? 0) > 0) artifacts.push({ type: 'plan', stationIndex: 1 });
  if (isPresent(phases.implementation?.artifact)) artifacts.push({ type: 'code', stationIndex: 2 });
  return artifacts;
}

export function createSceneConfig(status: CanonicalRunStatus): SceneConfig {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const stations = buildStations(status, currentPhase);
  const gates = buildGates(stations);
  const agents = buildAgents(status.phases, status.status, currentPhase);
  const artifacts = buildArtifacts(status.phases);

  return { stations, gates, agents, artifacts };
}

import {
  type CanonicalRunStatus,
  PHASE_NAMES,
  PHASE_ROLE,
  PHASE_ROLE_TYPE,
  type PhaseName,
  type Phases,
} from 'codeassembly-run-core';

import { ARTIFACT_COLORS } from '../../../../shared/constants/artifact-colors.js';
import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-type-colors.js';
import {
  findCurrentPhase,
  findPhaseDecision,
  isPhaseEvaluated,
  isPhasePresentInData,
} from '../../../../shared/phase-inference.js';
import { extractReviewerNames } from '../../shared/artifact-utils.js';
import type {
  AgentAnimationState,
  AgentConfig,
  CarriedArtifactConfig,
  CatwalkSceneConfig,
  GateConfig,
  OrchestratorConfig,
  StationArtifactConfig,
  StationConfig,
} from '../types.js';

/** Maps run-index artifact type names to shared ARTIFACT_COLORS keys. */
const ARTIFACT_TYPE_COLOR_KEY: Record<string, keyof typeof ARTIFACT_COLORS> = {
  architecture: 'arch',
  plan: 'plan',
  code: 'code',
  review: 'review',
  simplifier: 'clean',
  holistic: 'holi',
};

function lookupArtifactColor(type: string): string {
  const key = ARTIFACT_TYPE_COLOR_KEY[type];
  return key === undefined ? ARTIFACT_COLORS.code : ARTIFACT_COLORS[key];
}

/**
 * Map from phase names (both visualization-layer PHASE_NAMES aliases and
 * data-model property names) to station indices. Entries with unknown
 * phases are skipped during artifact building.
 */
const PHASE_TO_STATION: Record<string, number> = {
  architecture: 0,
  planning: 1,
  implementation: 2,
  review: 3,
  parallelReview: 3,
  simplifier: 4,
  codeSimplifier: 4,
  holistic: 5,
  holisticReview: 5,
  summary: 6,
};

/** Short phase alias used as agent IDs for non-review phases. */
const PHASE_ID: Record<string, string> = {
  architecture: 'arch',
  planning: 'plan',
  implementation: 'coder',
  simplifier: 'simp',
  holistic: 'holi',
};

/**
 * The Phases type uses `| undefined` but runtime data from Zod can carry `null`
 * phase values. This helper handles both cases while satisfying the eqeqeq lint rule.
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

// -- Phase status accessors (mirrors agent-state-resolver.ts) --

type PhaseStatusAccessor = (phases: Phases) => string | undefined;

const PHASE_STATUS_ACCESSORS: Record<PhaseName, PhaseStatusAccessor> = {
  architecture: (phases) => phases.architecture?.status,
  planning: (phases) => phases.planning?.status,
  implementation: (phases) => phases.implementation?.status,
  review: (phases) => {
    if (phases.parallelReview !== undefined) {
      if (phases.parallelReview.status !== undefined) {
        return phases.parallelReview.status;
      }
      const hasRunningReviewer = Object.values(phases.parallelReview.reviewers ?? {}).some(
        (r) => r.status === undefined,
      );
      return hasRunningReviewer ? 'in_progress' : 'completed';
    }
    return phases.review?.status;
  },
  simplifier: (phases) => phases.codeSimplifier?.status,
  holistic: (phases) => phases.holisticReview?.status,
  summary: () => {},
};

// region | Sub-function A: stations

function buildStations(status: CanonicalRunStatus): StationConfig[] {
  return PHASE_NAMES.map((phase) => {
    const decision = findPhaseDecision(phase, status.phaseDecisions);
    const isAbsent = decision?.run === false;
    return {
      phase,
      label: PHASE_ROLE[phase],
      color: ROLE_TYPE_COLORS[PHASE_ROLE_TYPE[phase]],
      absent: isAbsent,
      skipped: isAbsent,
    };
  });
}

// endregion | Sub-function A: stations

// region | Sub-function B: orchestrator

/** Amber color for iteration v2, orange for v3+. */
const ITERATION_COLORS = {
  v2: '#ffaa00',
  v3plus: '#ff6600',
};

function buildOrchestrator(status: CanonicalRunStatus, currentPhase: PhaseName | undefined): OrchestratorConfig {
  let stationIndex: number;

  if (status.status === 'completed') {
    stationIndex = 6;
  } else if (currentPhase !== undefined && status.status === 'in_progress') {
    stationIndex = PHASE_NAMES.indexOf(currentPhase);
  } else {
    stationIndex = -1;
  }

  const working = currentPhase !== undefined && !isPhasePresentInData(currentPhase, status.phases);

  const carriedArtifacts = buildCarriedArtifacts(status, stationIndex, working);
  const codeBadge = buildCodeBadge(status);

  const celebrating = status.status === 'completed';

  const waiting = status.waitingForInput !== undefined && status.status === 'in_progress';

  return { stationIndex, working, celebrating, waiting, carriedArtifacts, codeBadge };
}

/**
 * Build carried artifacts for the orchestrator. When the orchestrator is working
 * (delivering to a station), carry the most recent output artifacts from the
 * previous non-absent station.
 */
function buildCarriedArtifacts(
  status: CanonicalRunStatus,
  stationIndex: number,
  working: boolean,
): CarriedArtifactConfig[] {
  if (!working || stationIndex <= 0 || !isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  // Find the most recent output artifacts from previous stations
  // Scan stations in reverse from the orchestrator's current position
  for (let i = stationIndex - 1; i >= 0; i--) {
    const stationArtifacts = status.artifacts.filter((a) => PHASE_TO_STATION[a.phase] === i);

    if (stationArtifacts.length > 0) {
      return stationArtifacts.map((a) => ({
        label: a.type,
        color: lookupArtifactColor(a.type),
      }));
    }
  }

  return [];
}

/** Build the code badge showing iteration count when implementation has been re-entered. */
function buildCodeBadge(status: CanonicalRunStatus): OrchestratorConfig['codeBadge'] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return null;
  }

  // Find the max iteration value among implementation-phase artifacts
  let maxIteration = 0;
  for (const artifact of status.artifacts) {
    const stationIndex = PHASE_TO_STATION[artifact.phase];
    if (stationIndex === 2 && isPresent(artifact.iteration) && artifact.iteration > maxIteration) {
      maxIteration = artifact.iteration;
    }
  }

  if (maxIteration <= 1) {
    return null;
  }

  const color = maxIteration === 2 ? ITERATION_COLORS.v2 : ITERATION_COLORS.v3plus;
  return { label: `v${String(maxIteration)}`, color };
}

// endregion | Sub-function B: orchestrator

// -- Agent state resolution --

function resolveAgentState(
  phase: PhaseName,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentAnimationState {
  if (status.status === 'completed') return 'celebrating';
  if (status.status === 'failed') return 'concerned';

  // in_progress and needs_manual_review use per-phase logic
  if (phase === currentPhase && !isPhasePresentInData(phase, status.phases)) {
    return 'working';
  }

  if (PHASE_STATUS_ACCESSORS[phase](status.phases) === 'in_progress') {
    return 'working';
  }

  if (isPhaseEvaluated(phase, status.phases)) {
    return 'resting';
  }

  const currentPhaseIndex = currentPhase === undefined ? -1 : PHASE_NAMES.indexOf(currentPhase);
  if (PHASE_NAMES.indexOf(phase) < currentPhaseIndex) {
    return 'resting';
  }

  return 'idle';
}

// region | Sub-function C: agents

function buildAgents(status: CanonicalRunStatus, currentPhase: PhaseName | undefined): AgentConfig[] {
  const agents: AgentConfig[] = [];

  for (const phase of PHASE_NAMES) {
    if (phase === 'summary') continue;

    if (phase === 'review') {
      agents.push(...buildReviewerAgents(status, currentPhase));
      continue;
    }

    const phaseId = PHASE_ID[phase];
    if (phaseId === undefined) continue;

    agents.push({
      id: phaseId,
      role: PHASE_ROLE[phase],
      roleType: PHASE_ROLE_TYPE[phase],
      stationIndex: PHASE_NAMES.indexOf(phase),
      slotIndex: 0,
      state: resolveAgentState(phase, status, currentPhase),
    });
  }

  return agents;
}

/** Build a single fallback reviewer agent when no reviewer names are available. */
function defaultReviewerAgent(status: CanonicalRunStatus, currentPhase: PhaseName | undefined): AgentConfig[] {
  return [
    {
      id: 'reviewer-0',
      role: 'reviewer',
      roleType: PHASE_ROLE_TYPE.review,
      stationIndex: 3,
      slotIndex: 0,
      state: resolveAgentState('review', status, currentPhase),
    },
  ];
}

function buildReviewerAgents(status: CanonicalRunStatus, currentPhase: PhaseName | undefined): AgentConfig[] {
  const parallelReview = status.phases.parallelReview;

  if (!isPresent(parallelReview)) {
    return defaultReviewerAgent(status, currentPhase);
  }

  const names = extractReviewerNames(parallelReview);
  if (names.length === 0) {
    return defaultReviewerAgent(status, currentPhase);
  }

  return names.map((name, i) => ({
    id: `reviewer-${String(i)}`,
    role: name,
    roleType: PHASE_ROLE_TYPE.review,
    stationIndex: 3,
    slotIndex: i,
    state: resolveAgentState('review', status, currentPhase),
  }));
}

// endregion | Sub-function C: agents

// region | Sub-function D: gates

function buildGates(stations: StationConfig[], phases: Phases): GateConfig[] {
  const gates: GateConfig[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const station = stations[i];
    if (station === undefined) continue;
    const isOpen = station.absent || isPhaseEvaluated(station.phase, phases);
    gates.push({
      betweenStations: [i, i + 1],
      open: isOpen,
    });
  }
  return gates;
}

// endregion | Sub-function D: gates

// region | Sub-function E: artifacts

function buildArtifacts(status: CanonicalRunStatus): StationArtifactConfig[] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  // Build reviewer name -> slot index mapping for per-agent attribution
  const reviewerSlotMap = new Map<string, number>();
  const parallelReview = status.phases.parallelReview;
  if (isPresent(parallelReview)) {
    const names = extractReviewerNames(parallelReview);
    for (const [i, name] of names.entries()) {
      reviewerSlotMap.set(name, i);
    }
  }

  const artifacts: StationArtifactConfig[] = [];

  for (const entry of status.artifacts) {
    // Coder change-summaries always belong to the implementation station,
    // even when produced during the review phase (fix cycles).
    const stationIndex =
      entry.type === 'change-summary' && entry.role === 'coder'
        ? PHASE_TO_STATION.implementation
        : PHASE_TO_STATION[entry.phase];
    if (stationIndex === undefined) continue;

    // Determine agent slot index for per-agent artifact attribution
    let agentSlotIndex = 0;
    if (stationIndex === 3 && reviewerSlotMap.size > 0) {
      // Review station: match artifact agent to reviewer slot
      const slot = reviewerSlotMap.get(entry.agent);
      if (slot === undefined) {
        // Fallback to slot 0 with warning
        console.warn(`Artifact agent "${entry.agent}" not found in reviewer names; defaulting to slot 0`);
      } else {
        agentSlotIndex = slot;
      }
    }

    artifacts.push({
      stationIndex,
      agentSlotIndex,
      label: entry.type,
      color: lookupArtifactColor(entry.type),
      slot: 'output',
      ...(entry.iteration !== undefined && { version: entry.iteration }),
    });
  }

  return artifacts;
}

/**
 * Build input artifacts derived from upstream station outputs.
 *
 * For in-progress runs, inputs are only derived at stations the orchestrator
 * has reached (stations <= `orchestratorStationIndex`). This ensures inputs
 * appear in the diff exactly when the orchestrator moves to their station,
 * producing the co-occurrence signal the choreographer needs to infer a delivery.
 *
 * For completed runs, all inputs are derived (orchestrator has passed all stations).
 */
function buildInputArtifacts(
  status: CanonicalRunStatus,
  outputArtifacts: StationArtifactConfig[],
  orchestratorStationIndex: number,
): StationArtifactConfig[] {
  const inputs: StationArtifactConfig[] = [];

  // Group output artifacts by station
  const outputsByStation = new Map<number, StationArtifactConfig[]>();
  for (const art of outputArtifacts) {
    const list = outputsByStation.get(art.stationIndex);
    if (list === undefined) {
      outputsByStation.set(art.stationIndex, [art]);
    } else {
      list.push(art);
    }
  }

  // For each station N that has outputs, generate inputs at station N+1.
  // Cap at N+1 <= 5 so the summary station (6) is only populated by the
  // completed block below, avoiding duplicate inputs.
  // Only derive inputs at stations the orchestrator has reached.
  for (const [stationIndex, stationOutputs] of outputsByStation) {
    const nextStation = stationIndex + 1;
    if (nextStation <= 5 && nextStation <= orchestratorStationIndex) {
      for (const output of stationOutputs) {
        // Fix-cycle artifacts re-enter the same station workflow and should
        // not cascade as new inputs to the next station. Any artifact with a
        // version (mapped from iteration) was produced during a review cycle.
        if (output.version !== undefined) continue;
        inputs.push({
          stationIndex: nextStation,
          agentSlotIndex: 0,
          label: output.label,
          color: output.color,
          slot: 'input',
        });
      }
    }
  }

  // Summary station (index 6): collect all run deliverables when completed
  if (status.status === 'completed') {
    for (const art of outputArtifacts) {
      // Skip artifacts already at station 6 to avoid duplicates
      if (art.stationIndex === 6) continue;
      inputs.push({
        stationIndex: 6,
        agentSlotIndex: 0,
        label: art.label,
        color: art.color,
        slot: 'input',
      });
    }
  }

  return inputs;
}

// endregion | Sub-function E: artifacts

// -- Public mapper --

export function mapRunToCatwalk(status: CanonicalRunStatus): CatwalkSceneConfig {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const stations = buildStations(status);
  const orchestrator = buildOrchestrator(status, currentPhase);
  const agents = buildAgents(status, currentPhase);
  const gates = buildGates(stations, status.phases);
  const outputArtifacts = buildArtifacts(status);
  const inputArtifacts = buildInputArtifacts(status, outputArtifacts, orchestrator.stationIndex);
  const artifacts = [...outputArtifacts, ...inputArtifacts];

  return { orchestrator, stations, agents, gates, artifacts };
}

import type { CanonicalRunStatus, PhaseName, Phases } from 'codeassembly-run-core';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE } from 'codeassembly-run-core';

import { ARTIFACT_COLORS } from '../../../../shared/constants/artifact-colors.js';
import { ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
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
  FactoryFloorSceneConfig,
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

/** Maps phase names to station indices. */
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

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

// -- Phase status accessors --

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

// -- Stations --

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

// -- Orchestrator --

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

  return { stationIndex, working, celebrating, carriedArtifacts, codeBadge };
}

function buildCarriedArtifacts(
  status: CanonicalRunStatus,
  stationIndex: number,
  working: boolean,
): CarriedArtifactConfig[] {
  if (!working || stationIndex <= 0 || !isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

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

function buildCodeBadge(status: CanonicalRunStatus): OrchestratorConfig['codeBadge'] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return null;
  }

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

// -- Agent state resolution --

function resolveAgentState(
  phase: PhaseName,
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentAnimationState {
  if (status.status === 'completed') return 'celebrating';
  if (status.status === 'failed') return 'concerned';

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

// -- Agents --

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

// -- Artifacts --

function buildArtifacts(status: CanonicalRunStatus): StationArtifactConfig[] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

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
    const stationIndex =
      entry.type === 'change-summary' && entry.role === 'coder'
        ? PHASE_TO_STATION.implementation
        : PHASE_TO_STATION[entry.phase];
    if (stationIndex === undefined) continue;

    let agentSlotIndex = 0;
    if (stationIndex === 3 && reviewerSlotMap.size > 0) {
      const slot = reviewerSlotMap.get(entry.agent);
      if (slot === undefined) {
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

function buildInputArtifacts(
  status: CanonicalRunStatus,
  outputArtifacts: StationArtifactConfig[],
  orchestratorStationIndex: number,
): StationArtifactConfig[] {
  const inputs: StationArtifactConfig[] = [];

  const outputsByStation = new Map<number, StationArtifactConfig[]>();
  for (const art of outputArtifacts) {
    const list = outputsByStation.get(art.stationIndex);
    if (list === undefined) {
      outputsByStation.set(art.stationIndex, [art]);
    } else {
      list.push(art);
    }
  }

  for (const [stationIndex, stationOutputs] of outputsByStation) {
    const nextStation = stationIndex + 1;
    if (nextStation <= 5 && nextStation <= orchestratorStationIndex) {
      for (const output of stationOutputs) {
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

  if (status.status === 'completed') {
    for (const art of outputArtifacts) {
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

// -- Public mapper --

/** Transforms a canonical run status into a factory-floor scene configuration. */
export function mapRunToFactoryFloor(status: CanonicalRunStatus): FactoryFloorSceneConfig {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const stations = buildStations(status);
  const orchestrator = buildOrchestrator(status, currentPhase);
  const agents = buildAgents(status, currentPhase);
  const outputArtifacts = buildArtifacts(status);
  const inputArtifacts = buildInputArtifacts(status, outputArtifacts, orchestrator.stationIndex);
  const artifacts = [...outputArtifacts, ...inputArtifacts];

  return { orchestrator, stations, agents, artifacts };
}

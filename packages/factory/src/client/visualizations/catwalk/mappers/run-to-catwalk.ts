import { PALETTE } from '../../../../shared/constants/palette.js';
import type { PhaseName } from '../../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE, ROLE_TYPE_COLORS } from '../../../../shared/constants/role-types.js';
import {
  findCurrentPhase,
  findPhaseDecision,
  isPhaseEvaluated,
  isPhasePresentInData,
} from '../../../../shared/phase-inference.js';
import type {
  CanonicalRunStatus,
  ParallelReviewPhase,
  Phases,
} from '../../../../shared/types/canonical.js';
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

/**
 * Artifact type to color mapping. Intentionally duplicated from
 * `ArtifactActor.ts` so that the catwalk mapper has no dependency
 * on the Excalibur game layer. When issue #177 lands with shared
 * constants, replace with the shared import.
 */
const ARTIFACT_COLORS: Record<string, string> = {
  architecture: PALETTE.blue,
  plan: PALETTE.green,
  code: PALETTE.yellow,
  review: PALETTE.red,
  simplifier: PALETTE.darkMagenta,
  holistic: PALETTE.darkCyan,
};

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

/** Narrow an unknown value to a non-null object (safe for `Object.keys`). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract reviewer names from any known parallelReview data shape.
 *
 * The orchestrate skill evolved its run-index.json format, producing three
 * known shapes for the parallelReview phase:
 *   1. Flat `reviewers` record (older runs) -- keyed by reviewer name
 *   2. `iterations[].perReviewer` records -- keyed by reviewer name
 *   3. Top-level `reviewerDetails` record -- keyed by reviewer name
 *
 * Shapes 2 and 3 pass through Zod's `.partial().loose()` validation
 * as untyped extra properties. Runtime access uses defensive type narrowing.
 */
function extractReviewerNames(parallelReview: ParallelReviewPhase): string[] {
  // Shape 1: flat reviewers record (canonical typed shape)
  const reviewers = parallelReview.reviewers;
  if (isPresent(reviewers) && Object.keys(reviewers).length > 0) {
    return Object.keys(reviewers);
  }

  // Shape 2: iterations[].perReviewer (passes through Zod .loose())
  const iterations = parallelReview.iterations;
  if (isPresent(iterations) && iterations.length > 0) {
    const names = new Set<string>();
    for (const iteration of iterations) {
      // perReviewer is an untyped property that passes through Zod .loose()
      if ('perReviewer' in iteration) {
        const perReviewer: unknown = iteration.perReviewer;
        if (isRecord(perReviewer)) {
          for (const name of Object.keys(perReviewer)) {
            names.add(name);
          }
        }
      }
      // Also collect from the typed reviewers: string[] array
      if (Array.isArray(iteration.reviewers)) {
        for (const name of iteration.reviewers) {
          names.add(name);
        }
      }
    }
    if (names.size > 0) return Array.from(names);
  }

  // Shape 3: top-level reviewerDetails (passes through Zod .loose())
  if ('reviewerDetails' in parallelReview) {
    const reviewerDetails: unknown = parallelReview.reviewerDetails;
    if (isRecord(reviewerDetails)) {
      const keys = Object.keys(reviewerDetails);
      if (keys.length > 0) return keys;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Phase status accessors (mirrors agent-state-resolver.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-function A: stations
// ---------------------------------------------------------------------------

function buildStations(
  status: CanonicalRunStatus,
): StationConfig[] {
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

// ---------------------------------------------------------------------------
// Sub-function B: orchestrator
// ---------------------------------------------------------------------------

function buildOrchestrator(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): OrchestratorConfig {
  let stationIndex: number;

  if (status.status === 'completed') {
    stationIndex = 6;
  } else if (status.status === 'in_progress' && currentPhase !== undefined) {
    stationIndex = PHASE_NAMES.indexOf(currentPhase);
  } else {
    stationIndex = -1;
  }

  const working = currentPhase !== undefined && !isPhasePresentInData(currentPhase, status.phases);

  const carriedArtifacts: CarriedArtifactConfig[] = [];
  const codeBadge: OrchestratorConfig['codeBadge'] = null;

  return { stationIndex, working, carriedArtifacts, codeBadge };
}

// ---------------------------------------------------------------------------
// Agent state resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-function C: agents
// ---------------------------------------------------------------------------

function buildAgents(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentConfig[] {
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

function buildReviewerAgents(
  status: CanonicalRunStatus,
  currentPhase: PhaseName | undefined,
): AgentConfig[] {
  const parallelReview = status.phases.parallelReview;

  // Review is current but no parallelReview data yet: emit a single generic reviewer
  if (currentPhase === 'review' && !isPresent(parallelReview)) {
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

  if (!isPresent(parallelReview)) {
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

  const names = extractReviewerNames(parallelReview);
  if (names.length === 0) {
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

  return names.map((name, i) => ({
    id: `reviewer-${String(i)}`,
    role: name,
    roleType: PHASE_ROLE_TYPE.review,
    stationIndex: 3,
    slotIndex: i,
    state: resolveAgentState('review', status, currentPhase),
  }));
}

// ---------------------------------------------------------------------------
// Sub-function D: gates
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Sub-function E: artifacts
// ---------------------------------------------------------------------------

function buildArtifacts(status: CanonicalRunStatus): StationArtifactConfig[] {
  if (!isPresent(status.artifacts) || status.artifacts.length === 0) {
    return [];
  }

  const artifacts: StationArtifactConfig[] = [];

  for (const entry of status.artifacts) {
    const stationIndex = PHASE_TO_STATION[entry.phase];
    if (stationIndex === undefined) continue;

    artifacts.push({
      stationIndex,
      label: entry.type,
      color: ARTIFACT_COLORS[entry.type] ?? PALETTE.cyan,
      slot: 'output',
      ...(entry.iteration === undefined ? {} : { version: entry.iteration }),
    });
  }

  return artifacts;
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapRunToCatwalk(status: CanonicalRunStatus): CatwalkSceneConfig {
  const currentPhase = findCurrentPhase(status.phases, status.phaseDecisions, status.status);
  const stations = buildStations(status);
  const orchestrator = buildOrchestrator(status, currentPhase);
  const agents = buildAgents(status, currentPhase);
  const gates = buildGates(stations, status.phases);
  const artifacts = buildArtifacts(status);

  return { orchestrator, stations, agents, gates, artifacts };
}

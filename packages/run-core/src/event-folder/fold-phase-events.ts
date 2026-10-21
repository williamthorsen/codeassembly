import { isRecord } from '../type-guards.ts';
import type {
  ArchitecturePhase,
  CanonicalRunStatus,
  CodeSimplifierPhase,
  HolisticReviewPhase,
  ImplementationPhase,
  ParallelReviewPhase,
  PhaseStatus,
  PlanningPhase,
  QualityGates,
  UsageMetrics,
} from '../types/canonical.ts';
import type { EventPhaseName, RunEvent } from '../types/run-log.ts';
import { extractUsage, isCriticality } from './event-fields.ts';

/**
 * Completes a phase by merging the event's data into the phase's entry. Creates the entry when this event
 * doesn't follow any `phase_started` event, except for the review phase, which stays absent.
 */
export function applyPhaseCompleted(
  state: CanonicalRunStatus,
  event: Extract<RunEvent, { event: 'phase_completed' }>,
): void {
  const { phase, status, data, t: timestamp } = event;
  const usage = extractUsage(event);

  switch (phase) {
    case 'architecture': {
      const existing = state.phases.architecture ?? { impactLevel: undefined, artifact: undefined, status };
      state.phases.architecture = mergeArchitecture(existing, status, data);
      state.phases.architecture.completedAt = timestamp;
      if (usage) state.phases.architecture.usage = usage;
      break;
    }
    case 'planning': {
      const existing = state.phases.planning ?? { stepCount: undefined, artifacts: undefined, status };
      state.phases.planning = mergePlanning(existing, status, data);
      state.phases.planning.completedAt = timestamp;
      if (usage) state.phases.planning.usage = usage;
      break;
    }
    case 'implementation': {
      const existing = state.phases.implementation ?? { artifact: undefined, qualityGates: undefined, status };
      state.phases.implementation = mergeImplementation(existing, status, data);
      state.phases.implementation.completedAt = timestamp;
      if (usage) state.phases.implementation.usage = usage;
      break;
    }
    case 'review':
      if (state.phases.parallelReview) {
        applyReviewPhaseCompleted(state.phases.parallelReview, status, data, timestamp, usage);
      }
      break;

    case 'simplifier': {
      const existing = state.phases.codeSimplifier ?? {
        ran: false,
        actionableFindings: false,
        coderFixCycleRan: false,
        artifact: undefined,
      };
      state.phases.codeSimplifier = mergeCodeSimplifier(existing, status, data);
      state.phases.codeSimplifier.completedAt = timestamp;
      if (usage) state.phases.codeSimplifier.usage = usage;
      break;
    }
    case 'holistic': {
      const existing = state.phases.holisticReview ?? {
        criticality: undefined,
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 0,
        artifact: undefined,
        status,
      };
      state.phases.holisticReview = mergeHolisticReview(existing, status, data);
      state.phases.holisticReview.completedAt = timestamp;
      if (usage) state.phases.holisticReview.usage = usage;
      break;
    }
  }
}

/** Initializes the phase's entry as in progress, replacing any existing entry. */
export function applyPhaseStarted(state: CanonicalRunStatus, phase: EventPhaseName, timestamp: string): void {
  switch (phase) {
    case 'architecture':
      state.phases.architecture = {
        status: 'in_progress',
        impactLevel: undefined,
        artifact: undefined,
        startedAt: timestamp,
      };
      break;
    case 'planning':
      state.phases.planning = {
        status: 'in_progress',
        stepCount: undefined,
        artifacts: undefined,
        startedAt: timestamp,
      };
      break;
    case 'implementation':
      state.phases.implementation = {
        status: 'in_progress',
        artifact: undefined,
        qualityGates: undefined,
        startedAt: timestamp,
      };
      break;
    case 'review':
      state.phases.parallelReview = {
        status: 'in_progress',
        aggregatedCriticality: undefined,
        reviewRoundsUsed: 0,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
        startedAt: timestamp,
        iterations: [],
      };
      break;
    case 'simplifier':
      state.phases.codeSimplifier = {
        ran: false,
        actionableFindings: false,
        coderFixCycleRan: false,
        artifact: undefined,
        status: 'in_progress',
        startedAt: timestamp,
      };
      break;
    case 'holistic':
      state.phases.holisticReview = {
        status: 'in_progress',
        criticality: undefined,
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 0,
        artifact: undefined,
        startedAt: timestamp,
      };
      break;
  }
}

// region | Helpers

/** Completes the parallel-review phase, taking the well-typed fields of `data`. */
function applyReviewPhaseCompleted(
  review: ParallelReviewPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
  timestamp: string,
  usage: UsageMetrics | undefined,
): void {
  review.status = status;
  review.completedAt = timestamp;
  if (usage) review.usage = usage;
  if (!data) {
    return;
  }

  if (isCriticality(data['aggregatedCriticality'])) {
    review.aggregatedCriticality = data['aggregatedCriticality'];
  }
  if (typeof data['reviewRoundsUsed'] === 'number') {
    review.reviewRoundsUsed = data['reviewRoundsUsed'];
  }
}

/** Extracts qualityGates from data, falling back to existing value. */
function extractQualityGates(
  data: Record<string, unknown> | undefined,
  existing: string | QualityGates | undefined,
): string | QualityGates | undefined {
  if (data?.['qualityGates'] === undefined) return existing;
  if (typeof data['qualityGates'] === 'string') return data['qualityGates'];
  if (isRecord(data['qualityGates']) && isQualityGatesRecord(data['qualityGates'])) {
    return data['qualityGates'];
  }
  return existing;
}

/** Narrows `value` to a `QualityGates` record, in which each gate is absent or a string. */
function isQualityGatesRecord(value: Record<string, unknown>): value is QualityGates & Record<string, unknown> {
  return (
    (value['typecheck'] === undefined || typeof value['typecheck'] === 'string') &&
    (value['lint'] === undefined || typeof value['lint'] === 'string') &&
    (value['tests'] === undefined || typeof value['tests'] === 'string')
  );
}

/** Narrows `value` to an array whose every item is a string. */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Merges the well-typed fields of `data` into an architecture phase. */
function mergeArchitecture(
  existing: ArchitecturePhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): ArchitecturePhase {
  return {
    ...existing,
    status,
    impactLevel: typeof data?.['impactLevel'] === 'string' ? data['impactLevel'] : existing.impactLevel,
    artifact: typeof data?.['artifact'] === 'string' ? data['artifact'] : existing.artifact,
  };
}

/** Merges the well-typed fields of `data` into a code-simplifier phase. */
function mergeCodeSimplifier(
  existing: CodeSimplifierPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): CodeSimplifierPhase {
  return {
    ...existing,
    status,
    ran: typeof data?.['ran'] === 'boolean' ? data['ran'] : existing.ran,
    actionableFindings:
      typeof data?.['actionableFindings'] === 'boolean' ? data['actionableFindings'] : existing.actionableFindings,
    coderFixCycleRan:
      typeof data?.['coderFixCycleRan'] === 'boolean' ? data['coderFixCycleRan'] : existing.coderFixCycleRan,
    artifact: typeof data?.['artifact'] === 'string' ? data['artifact'] : existing.artifact,
  };
}

/** Merges the well-typed fields of `data` into a holistic-review phase. */
function mergeHolisticReview(
  existing: HolisticReviewPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): HolisticReviewPhase {
  return {
    ...existing,
    status,
    criticality: isCriticality(data?.['criticality']) ? data['criticality'] : existing.criticality,
    reReviewCriticality: isCriticality(data?.['reReviewCriticality'])
      ? data['reReviewCriticality']
      : existing.reReviewCriticality,
    coderFixCycleRan:
      typeof data?.['coderFixCycleRan'] === 'boolean' ? data['coderFixCycleRan'] : existing.coderFixCycleRan,
    reviewRoundsUsed:
      typeof data?.['reviewRoundsUsed'] === 'number' ? data['reviewRoundsUsed'] : existing.reviewRoundsUsed,
    artifact: typeof data?.['artifact'] === 'string' ? data['artifact'] : existing.artifact,
  };
}

/** Merges the well-typed fields of `data` into an implementation phase. */
function mergeImplementation(
  existing: ImplementationPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): ImplementationPhase {
  return {
    ...existing,
    status,
    artifact: typeof data?.['artifact'] === 'string' ? data['artifact'] : existing.artifact,
    qualityGates: extractQualityGates(data, existing.qualityGates),
  };
}

/** Merges the well-typed fields of `data` into a planning phase. */
function mergePlanning(
  existing: PlanningPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): PlanningPhase {
  return {
    ...existing,
    status,
    stepCount: typeof data?.['stepCount'] === 'number' ? data['stepCount'] : existing.stepCount,
    artifacts: isStringArray(data?.['artifacts']) ? data['artifacts'] : existing.artifacts,
  };
}

// endregion | Helpers

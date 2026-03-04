import type {
  ArchitecturePhase,
  ArtifactEntry,
  CanonicalRunStatus,
  CodeSimplifierPhase,
  Criticality,
  HolisticReviewPhase,
  ImplementationPhase,
  ParallelReviewPhase,
  PhaseStatus,
  PlanningPhase,
  QualityGates,
  ReviewIteration,
} from './types/canonical.js';
import type { EventPhaseName, RunEvent, RunHeader } from './types/run-log.js';

// -- Type guard helpers -------------------------------------------------------

const CRITICALITY_VALUES: ReadonlySet<string> = new Set(['none', 'low', 'medium', 'high']);

function isCriticality(value: unknown): value is Criticality {
  return typeof value === 'string' && CRITICALITY_VALUES.has(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isQualityGatesRecord(value: Record<string, unknown>): value is QualityGates & Record<string, unknown> {
  return (
    (value.typecheck === undefined || typeof value.typecheck === 'string') &&
    (value.lint === undefined || typeof value.lint === 'string') &&
    (value.tests === undefined || typeof value.tests === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract qualityGates from data, falling back to existing value. */
function extractQualityGates(
  data: Record<string, unknown> | undefined,
  existing: string | QualityGates | undefined,
): string | QualityGates | undefined {
  if (data?.qualityGates === undefined) return existing;
  if (typeof data.qualityGates === 'string') return data.qualityGates;
  if (isRecord(data.qualityGates) && isQualityGatesRecord(data.qualityGates)) {
    return data.qualityGates;
  }
  return existing;
}

/**
 * Reconstruct a CanonicalRunStatus from a RunHeader and a sequence of RunEvents.
 * This is a pure function: same inputs always produce the same output.
 */
export function foldEvents(header: RunHeader, events: ReadonlyArray<RunEvent>): CanonicalRunStatus {
  const state: CanonicalRunStatus = {
    runId: header.runId,
    projectSlug: header.projectSlug,
    ticketId: header.ticketId,
    projectRoot: header.projectRoot,
    branch: header.branch,
    task: header.task,
    startedAt: header.startedAt,
    completedAt: undefined,
    status: 'in_progress',
    reason: undefined,
    externalPlan: header.externalPlan,
    mergeBaseSha: header.mergeBaseSha,
    diffBase: header.diffBase,
    maxReviewRounds: header.maxReviewRounds,
    fixLowFindings: header.fixLowFindings,
    mode: header.mode,
    model: header.model,
    phases: {
      architecture: undefined,
      planning: undefined,
      implementation: undefined,
      parallelReview: undefined,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    phaseDecisions: {},
    artifacts: [],
  };

  for (const event of events) {
    applyEvent(state, event);
  }

  return state;
}

function applyEvent(state: CanonicalRunStatus, event: RunEvent): void {
  switch (event.event) {
    case 'run_started':
      break;

    case 'run_completed':
      state.status = event.status;
      state.completedAt = event.t;
      break;

    case 'run_failed':
      state.status = event.status;
      state.completedAt = event.t;
      state.reason = event.reason;
      break;

    case 'phase_decision':
      state.phaseDecisions ??= {};
      state.phaseDecisions[event.phase] = {
        run: event.run,
        reason: event.reason,
      };
      break;

    case 'phase_started':
      applyPhaseStarted(state, event.phase, event.t);
      break;

    case 'phase_completed':
      applyPhaseCompleted(state, event.phase, event.status, event.data, event.t);
      break;

    case 'reviewer_dispatched':
    case 'reviewer_completed':
    case 'coder_fix_started':
    case 'coder_fix_completed':
    case 're_review_dispatched':
    case 're_review_completed':
      applyReviewEvent(state, event);
      break;

    case 'artifact_written':
      applyArtifactWritten(state, event);
      break;
  }
}

type ReviewEvent = Extract<
  RunEvent,
  {
    event:
      | 'reviewer_dispatched'
      | 'reviewer_completed'
      | 'coder_fix_started'
      | 'coder_fix_completed'
      | 're_review_dispatched'
      | 're_review_completed';
  }
>;

/** Ensure the iterations array has an entry at the given zero-based index and return it. */
function ensureIteration(review: { iterations?: ReviewIteration[] }, index: number): ReviewIteration {
  review.iterations ??= [];
  let iteration = review.iterations[index];
  if (!iteration) {
    iteration = { reviewers: [] };
    review.iterations[index] = iteration;
  }
  return iteration;
}

function applyReviewerDispatched(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 'reviewer_dispatched' }>,
): void {
  review.reviewers ??= {};
  review.reviewers[event.reviewer] = {
    ran: true,
    status: undefined,
    criticality: undefined,
    reason: undefined,
    reReviewCriticality: undefined,
    reReviewError: undefined,
  };
  const iter0 = ensureIteration(review, 0);
  if (!iter0.reviewers.includes(event.reviewer)) {
    iter0.reviewers.push(event.reviewer);
  }
  iter0.dispatchedAt ??= event.t;
}

function applyReviewerCompleted(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 'reviewer_completed' }>,
): void {
  const entry = review.reviewers?.[event.reviewer];
  if (entry) {
    entry.status = event.status;
    entry.criticality = event.criticality;
  }
  const firstIter = ensureIteration(review, 0);
  firstIter.reviewsCompletedAt = event.t;
}

function applyReReviewDispatched(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 're_review_dispatched' }>,
): void {
  review.selectiveReReview = {
    ran: true,
    reviewersDispatched: event.reviewers,
    additionalFixCycleRan: false,
  };
  const iterations = review.iterations ?? [];
  const nextIdx = iterations.length > 0 ? iterations.length : 1;
  const reIter = ensureIteration(review, nextIdx);
  reIter.reviewers = event.reviewers;
  reIter.dispatchedAt = event.t;
}

function applyReReviewCompleted(
  review: ParallelReviewPhase,
  event: Extract<ReviewEvent, { event: 're_review_completed' }>,
): void {
  for (const [reviewer, crit] of Object.entries(event.criticalities)) {
    const entry = review.reviewers?.[reviewer];
    if (entry) {
      entry.reReviewCriticality = crit;
    }
  }
  const iterations = review.iterations;
  if (iterations && iterations.length > 0) {
    const lastIdx = iterations.length - 1;
    const lastIter = ensureIteration(review, lastIdx);
    lastIter.reviewsCompletedAt = event.t;
  }
}

function applyReviewEvent(state: CanonicalRunStatus, event: ReviewEvent): void {
  const review = state.phases.parallelReview;
  if (!review) return;

  switch (event.event) {
    case 'reviewer_dispatched':
      applyReviewerDispatched(review, event);
      break;
    case 'reviewer_completed':
      applyReviewerCompleted(review, event);
      break;
    case 'coder_fix_started':
      review.coderFixCycleRan = true;
      ensureIteration(review, event.iteration - 1).coderFixStartedAt = event.t;
      break;
    case 'coder_fix_completed':
      ensureIteration(review, event.iteration - 1).coderFixCompletedAt = event.t;
      break;
    case 're_review_dispatched':
      applyReReviewDispatched(review, event);
      break;
    case 're_review_completed':
      applyReReviewCompleted(review, event);
      break;
  }
}

function applyPhaseStarted(state: CanonicalRunStatus, phase: EventPhaseName, timestamp: string): void {
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

function applyPhaseCompleted(
  state: CanonicalRunStatus,
  phase: EventPhaseName,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
  timestamp: string,
): void {
  switch (phase) {
    case 'architecture': {
      const existing = state.phases.architecture ?? { impactLevel: undefined, artifact: undefined, status };
      state.phases.architecture = mergeArchitecture(existing, status, data);
      state.phases.architecture.completedAt = timestamp;
      break;
    }
    case 'planning': {
      const existing = state.phases.planning ?? { stepCount: undefined, artifacts: undefined, status };
      state.phases.planning = mergePlanning(existing, status, data);
      state.phases.planning.completedAt = timestamp;
      break;
    }
    case 'implementation': {
      const existing = state.phases.implementation ?? { artifact: undefined, qualityGates: undefined, status };
      state.phases.implementation = mergeImplementation(existing, status, data);
      state.phases.implementation.completedAt = timestamp;
      break;
    }
    case 'review':
      if (state.phases.parallelReview) {
        state.phases.parallelReview.status = status;
        state.phases.parallelReview.completedAt = timestamp;
        if (data) {
          if (isCriticality(data.aggregatedCriticality)) {
            state.phases.parallelReview.aggregatedCriticality = data.aggregatedCriticality;
          }
          if (typeof data.reviewRoundsUsed === 'number') {
            state.phases.parallelReview.reviewRoundsUsed = data.reviewRoundsUsed;
          }
        }
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
      break;
    }
  }
}

function mergeArchitecture(
  existing: ArchitecturePhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): ArchitecturePhase {
  return {
    ...existing,
    status,
    impactLevel: typeof data?.impactLevel === 'string' ? data.impactLevel : existing.impactLevel,
    artifact: typeof data?.artifact === 'string' ? data.artifact : existing.artifact,
  };
}

function mergePlanning(
  existing: PlanningPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): PlanningPhase {
  return {
    ...existing,
    status,
    stepCount: typeof data?.stepCount === 'number' ? data.stepCount : existing.stepCount,
    artifacts: isStringArray(data?.artifacts) ? data.artifacts : existing.artifacts,
  };
}

function mergeImplementation(
  existing: ImplementationPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): ImplementationPhase {
  return {
    ...existing,
    status,
    artifact: typeof data?.artifact === 'string' ? data.artifact : existing.artifact,
    qualityGates: extractQualityGates(data, existing.qualityGates),
  };
}

function mergeCodeSimplifier(
  existing: CodeSimplifierPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): CodeSimplifierPhase {
  return {
    ...existing,
    status,
    ran: typeof data?.ran === 'boolean' ? data.ran : existing.ran,
    actionableFindings:
      typeof data?.actionableFindings === 'boolean' ? data.actionableFindings : existing.actionableFindings,
    coderFixCycleRan: typeof data?.coderFixCycleRan === 'boolean' ? data.coderFixCycleRan : existing.coderFixCycleRan,
    artifact: typeof data?.artifact === 'string' ? data.artifact : existing.artifact,
  };
}

function mergeHolisticReview(
  existing: HolisticReviewPhase,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): HolisticReviewPhase {
  return {
    ...existing,
    status,
    criticality: isCriticality(data?.criticality) ? data.criticality : existing.criticality,
    reReviewCriticality: isCriticality(data?.reReviewCriticality)
      ? data.reReviewCriticality
      : existing.reReviewCriticality,
    coderFixCycleRan: typeof data?.coderFixCycleRan === 'boolean' ? data.coderFixCycleRan : existing.coderFixCycleRan,
    reviewRoundsUsed: typeof data?.reviewRoundsUsed === 'number' ? data.reviewRoundsUsed : existing.reviewRoundsUsed,
    artifact: typeof data?.artifact === 'string' ? data.artifact : existing.artifact,
  };
}

function applyArtifactWritten(
  state: CanonicalRunStatus,
  event: Extract<RunEvent, { event: 'artifact_written' }>,
): void {
  const artifact: ArtifactEntry = {
    filename: event.filename,
    role: event.role,
    roleType: event.roleType,
    agent: event.agent,
    type: event.type,
    phase: event.phase,
    createdAt: event.t,
    ...(event.iteration !== undefined && { iteration: event.iteration }),
    ...(event.note !== undefined && { note: event.note }),
  };

  if (!state.artifacts) {
    state.artifacts = [];
  }
  state.artifacts.push(artifact);
}

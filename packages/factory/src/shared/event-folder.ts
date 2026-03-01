import type {
  ArchitecturePhase,
  ArtifactEntry,
  CanonicalRunStatus,
  CodeSimplifierPhase,
  Criticality,
  HolisticReviewPhase,
  ImplementationPhase,
  PhaseStatus,
  PlanningPhase,
  QualityGates,
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
      break;

    case 'phase_decision':
      if (state.phaseDecisions === undefined) {
        state.phaseDecisions = {};
      }
      state.phaseDecisions[event.phase] = {
        run: event.run,
        reason: event.reason,
      };
      break;

    case 'phase_started':
      applyPhaseStarted(state, event.phase);
      break;

    case 'phase_completed':
      applyPhaseCompleted(state, event.phase, event.status, event.data);
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

function applyReviewEvent(state: CanonicalRunStatus, event: ReviewEvent): void {
  switch (event.event) {
    case 'reviewer_dispatched':
      if (state.phases.parallelReview) {
        state.phases.parallelReview.reviewers[event.reviewer] = {
          ran: true,
          status: undefined,
          criticality: undefined,
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        };
      }
      break;

    case 'reviewer_completed':
      if (state.phases.parallelReview) {
        const entry = state.phases.parallelReview.reviewers[event.reviewer];
        if (entry) {
          entry.status = event.status;
          entry.criticality = event.criticality;
        }
      }
      break;

    case 'coder_fix_started':
      if (state.phases.parallelReview) {
        state.phases.parallelReview.coderFixCycleRan = true;
      }
      break;

    case 'coder_fix_completed':
      break;

    case 're_review_dispatched':
      if (state.phases.parallelReview) {
        state.phases.parallelReview.selectiveReReview = {
          ran: true,
          reviewersDispatched: event.reviewers,
          additionalFixCycleRan: false,
        };
      }
      break;

    case 're_review_completed':
      if (state.phases.parallelReview) {
        for (const [reviewer, crit] of Object.entries(event.criticalities)) {
          const entry = state.phases.parallelReview.reviewers[reviewer];
          if (entry) {
            entry.reReviewCriticality = crit;
          }
        }
      }
      break;
  }
}

function applyPhaseStarted(state: CanonicalRunStatus, phase: EventPhaseName): void {
  switch (phase) {
    case 'architecture':
      state.phases.architecture = { status: 'in_progress', impactLevel: undefined, artifact: undefined };
      break;
    case 'planning':
      state.phases.planning = { status: 'in_progress', stepCount: undefined, artifacts: undefined };
      break;
    case 'implementation':
      state.phases.implementation = { status: 'in_progress', artifact: undefined, qualityGates: undefined };
      break;
    case 'review':
      state.phases.parallelReview = {
        status: 'in_progress',
        aggregatedCriticality: undefined,
        reviewRoundsUsed: 0,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      };
      break;
    case 'simplifier':
      state.phases.codeSimplifier = {
        ran: false,
        actionableFindings: false,
        coderFixCycleRan: false,
        artifact: undefined,
        status: 'in_progress',
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
      };
      break;
  }
}

function toPhaseStatus(s: string): PhaseStatus {
  switch (s) {
    case 'completed':
      return 'completed';
    case 'skipped':
      return 'skipped';
    case 'failed':
      return 'failed';
    case 'in_progress':
      return 'in_progress';
    case 'approved':
      return 'approved';
    default:
      return 'completed';
  }
}

function applyPhaseCompleted(
  state: CanonicalRunStatus,
  phase: EventPhaseName,
  status: PhaseStatus,
  data: Record<string, unknown> | undefined,
): void {
  const ps = toPhaseStatus(status);

  switch (phase) {
    case 'architecture': {
      const existing = state.phases.architecture ?? { impactLevel: undefined, artifact: undefined, status: ps };
      state.phases.architecture = mergeArchitecture(existing, ps, data);
      break;
    }
    case 'planning': {
      const existing = state.phases.planning ?? { stepCount: undefined, artifacts: undefined, status: ps };
      state.phases.planning = mergePlanning(existing, ps, data);
      break;
    }
    case 'implementation': {
      const existing = state.phases.implementation ?? { artifact: undefined, qualityGates: undefined, status: ps };
      state.phases.implementation = mergeImplementation(existing, ps, data);
      break;
    }
    case 'review':
      if (state.phases.parallelReview) {
        state.phases.parallelReview.status = ps;
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
      state.phases.codeSimplifier = mergeCodeSimplifier(existing, ps, data);
      break;
    }
    case 'holistic': {
      const existing = state.phases.holisticReview ?? {
        criticality: undefined,
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 0,
        artifact: undefined,
        status: ps,
      };
      state.phases.holisticReview = mergeHolisticReview(existing, ps, data);
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
  };

  if (event.iteration !== undefined) {
    artifact.iteration = event.iteration;
  }
  if (event.note !== undefined) {
    artifact.note = event.note;
  }

  if (!state.artifacts) {
    state.artifacts = [];
  }
  state.artifacts.push(artifact);
}

import type { ArtifactEntry, CanonicalRunStatus } from '../types/canonical.ts';
import type { RunEvent, RunHeader } from '../types/run-log.ts';
import { applyPhaseCompleted, applyPhaseStarted } from './fold-phase-events.ts';
import { applyReviewEvent } from './fold-review-events.ts';

/** Reconstructs a CanonicalRunStatus from a RunHeader and a sequence of RunEvents. Pure. */
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
    effort: header.effort,
    approvalThreshold: header.approvalThreshold,
    budgetThreshold: header.budgetThreshold,
    mode: header.mode,
    model: header.model,
    waitingForInput: undefined,
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

// region | Helpers

/** Appends the written artifact to the run's artifact list. */
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

/** Applies one event to `state` in place. */
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
      applyPhaseCompleted(state, event);
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

    case 'waiting_for_input':
      state.waitingForInput = event.reason;
      break;

    case 'input_received':
      state.waitingForInput = undefined;
      break;
  }
}

// endregion | Helpers

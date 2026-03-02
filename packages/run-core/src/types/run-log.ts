import type { Criticality, PhaseStatus, ReviewerStatus, RunStatus } from './canonical.js';

/** Static run metadata extracted from a v3 run-index.json header. */
export interface RunHeader {
  runId: string;
  projectSlug: string;
  ticketId: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  startedAt: string;
  externalPlan: boolean | undefined;
  mergeBaseSha: string | undefined;
  diffBase: string | undefined;
  maxReviewRounds: number | undefined;
  fixLowFindings: boolean | undefined;
  mode: string | undefined;
  model: string | undefined;
}

/** Phase names as used in run-log.jsonl events. */
export type EventPhaseName = 'architecture' | 'planning' | 'implementation' | 'review' | 'simplifier' | 'holistic';

// -- Individual event interfaces -----------------------------------------------

export interface RunStartedEvent {
  t: string;
  event: 'run_started';
}

export interface RunCompletedEvent {
  t: string;
  event: 'run_completed';
  status: RunStatus;
}

export interface RunFailedEvent {
  t: string;
  event: 'run_failed';
  status: RunStatus;
  reason?: string | undefined;
}

export interface PhaseDecisionEvent {
  t: string;
  event: 'phase_decision';
  phase: string;
  run: boolean;
  reason?: string | undefined;
}

export interface PhaseStartedEvent {
  t: string;
  event: 'phase_started';
  phase: EventPhaseName;
}

export interface PhaseCompletedEvent {
  t: string;
  event: 'phase_completed';
  phase: EventPhaseName;
  status: PhaseStatus;
  data?: Record<string, unknown> | undefined;
}

export interface ReviewerDispatchedEvent {
  t: string;
  event: 'reviewer_dispatched';
  reviewer: string;
}

export interface ReviewerCompletedEvent {
  t: string;
  event: 'reviewer_completed';
  reviewer: string;
  status: ReviewerStatus;
  criticality: Criticality;
}

export interface CoderFixStartedEvent {
  t: string;
  event: 'coder_fix_started';
  iteration: number;
}

export interface CoderFixCompletedEvent {
  t: string;
  event: 'coder_fix_completed';
  iteration: number;
}

export interface ReReviewDispatchedEvent {
  t: string;
  event: 're_review_dispatched';
  reviewers: string[];
}

export interface ReReviewCompletedEvent {
  t: string;
  event: 're_review_completed';
  criticalities: Record<string, Criticality>;
}

export interface ArtifactWrittenEvent {
  t: string;
  event: 'artifact_written';
  filename: string;
  role: string;
  roleType: string;
  agent: string;
  type: string;
  phase: string;
  iteration?: number | undefined;
  note?: string | undefined;
}

/** Discriminated union of all 13 run-log event types. */
export type RunEvent =
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | PhaseDecisionEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | ReviewerDispatchedEvent
  | ReviewerCompletedEvent
  | CoderFixStartedEvent
  | CoderFixCompletedEvent
  | ReReviewDispatchedEvent
  | ReReviewCompletedEvent
  | ArtifactWrittenEvent;

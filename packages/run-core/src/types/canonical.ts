export type RunStatus = 'in_progress' | 'completed' | 'failed' | 'needs_manual_review';
export type Criticality = 'none' | 'low' | 'medium' | 'high';
export type ReviewerStatus = 'completed' | 'skipped' | 'failed';
export type PhaseStatus = 'completed' | 'skipped' | 'failed' | 'in_progress' | 'approved';

export interface ArtifactEntry {
  filename: string;
  role: string;
  roleType: string;
  agent: string;
  type: string;
  phase: string;
  createdAt: string;
  iteration?: number;
  note?: string;
}

export interface CanonicalRunStatus {
  runId: string;
  projectSlug: string;
  ticketId: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  startedAt: string;
  completedAt: string | undefined;
  status: RunStatus;
  externalPlan: boolean | undefined;
  mergeBaseSha: string | undefined;
  diffBase: string | undefined;
  maxReviewRounds: number | undefined;
  fixLowFindings: boolean | undefined;
  mode: string | undefined;
  model: string | undefined;
  phases: Phases;
  phaseDecisions: Record<string, PhaseDecision> | undefined;
  artifacts: ArtifactEntry[] | undefined;
}

export interface PhaseDecision {
  run: boolean;
  reason: string | undefined;
}

export interface Phases {
  architecture: ArchitecturePhase | undefined;
  planning: PlanningPhase | undefined;
  implementation: ImplementationPhase | undefined;
  parallelReview: ParallelReviewPhase | undefined;
  review: LegacyReviewPhase | undefined;
  codeSimplifier: CodeSimplifierPhase | undefined;
  holisticReview: HolisticReviewPhase | undefined;
}

export interface ArchitecturePhase {
  status: PhaseStatus;
  impactLevel: string | undefined;
  artifact: string | undefined;
  startedAt?: string;
  completedAt?: string;
}

export interface PlanningPhase {
  status: PhaseStatus;
  stepCount: number | undefined;
  artifacts: string[] | undefined;
  startedAt?: string;
  completedAt?: string;
}

export interface ImplementationPhase {
  status: PhaseStatus;
  artifact: string | undefined;
  qualityGates: string | QualityGates | undefined;
  startedAt?: string;
  completedAt?: string;
}

export interface QualityGates {
  typecheck: string | undefined;
  lint: string | undefined;
  tests: string | undefined;
}

export interface ReviewIteration {
  reviewers: string[];
  dispatchedAt?: string;
  reviewsCompletedAt?: string;
  coderFixStartedAt?: string;
  coderFixCompletedAt?: string;
}

export interface ParallelReviewPhase {
  aggregatedCriticality: Criticality | undefined;
  reviewRoundsUsed: number;
  reviewers?: Record<string, ReviewerInfo>;
  coderFixCycleRan: boolean;
  selectiveReReview: SelectiveReReview | undefined;
  status?: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  iterations?: ReviewIteration[];
}

export interface ReviewerInfo {
  ran: boolean;
  status: ReviewerStatus | undefined;
  criticality: Criticality | undefined;
  reason: string | undefined;
  reReviewCriticality: Criticality | undefined;
  reReviewError: string | undefined;
  startedAt?: string;
  completedAt?: string;
}

export interface SelectiveReReview {
  ran: boolean;
  reviewersDispatched: string[];
  additionalFixCycleRan: boolean;
}

export interface CodeSimplifierPhase {
  ran: boolean;
  actionableFindings: boolean;
  coderFixCycleRan: boolean;
  artifact: string | undefined;
  status?: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
}

export interface HolisticReviewPhase {
  status: PhaseStatus;
  criticality: Criticality | undefined;
  reReviewCriticality: Criticality | undefined;
  coderFixCycleRan: boolean;
  reviewRoundsUsed: number;
  artifact: string | undefined;
  startedAt?: string;
  completedAt?: string;
}

export interface LegacyReviewPhase {
  status: PhaseStatus;
  iterations: number | undefined;
  finalCriticality: Criticality | undefined;
}

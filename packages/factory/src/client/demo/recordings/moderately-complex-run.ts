import { foldEvents } from '../../../shared/event-folder.js';
import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import type { RunEvent, RunHeader } from '../../../shared/types/run-log.js';
import type { DemoRecording } from '../index.js';

// ---------------------------------------------------------------------------
// Source data: header + events define the raw run log. These are used once at
// module load time to pre-generate the curated snapshot sequence below.
// ---------------------------------------------------------------------------

const header: RunHeader = {
  runId: '20260301-120000Z-orchestrated',
  projectSlug: 'demo-project',
  ticketId: 'DEMO-1',
  projectRoot: '/demo',
  branch: 'demo-1/feat/demo-feature',
  task: 'Implement the demo feature with full review cycle',
  startedAt: '2026-03-01T12:00:00Z',
  externalPlan: false,
  mergeBaseSha: 'abc1234',
  diffBase: 'main',
  maxReviewRounds: 3,
  effort: undefined,
  approvalThreshold: undefined,
  budgetThreshold: undefined,
  mode: 'orchestrated',
  model: 'claude-opus-4-6',
};

const events: RunEvent[] = [
  // Run started
  { t: '2026-03-01T12:00:00Z', event: 'run_started' },

  // Phase decisions
  { t: '2026-03-01T12:00:01Z', event: 'phase_decision', phase: 'architecture', run: true, reason: 'New feature' },
  {
    t: '2026-03-01T12:00:02Z',
    event: 'phase_decision',
    phase: 'planning',
    run: true,
    reason: 'Multi-step implementation',
  },
  { t: '2026-03-01T12:00:03Z', event: 'phase_decision', phase: 'implementation', run: true, reason: undefined },
  { t: '2026-03-01T12:00:04Z', event: 'phase_decision', phase: 'review-cycle', run: true, reason: undefined },

  // Phase 1: Architecture
  { t: '2026-03-01T12:01:00Z', event: 'phase_started', phase: 'architecture' },
  {
    t: '2026-03-01T12:02:00Z',
    event: 'artifact_written',
    filename: '20260301-120100Z_architect_architecture.md',
    role: 'architect',
    roleType: 'analyst',
    agent: 'orchestrated-architect',
    type: 'architecture',
    phase: 'architecture',
    iteration: undefined,
    note: undefined,
  },
  {
    t: '2026-03-01T12:02:30Z',
    event: 'phase_completed',
    phase: 'architecture',
    status: 'completed',
    data: { impactLevel: 'medium', artifact: 'architecture.md' },
  },

  // Phase 2: Planning
  { t: '2026-03-01T12:03:00Z', event: 'phase_started', phase: 'planning' },
  {
    t: '2026-03-01T12:04:00Z',
    event: 'artifact_written',
    filename: '20260301-120300Z_planner_orchestration-plan.md',
    role: 'planner',
    roleType: 'planner',
    agent: 'orchestrated-planner',
    type: 'orchestration-plan',
    phase: 'planning',
    iteration: undefined,
    note: undefined,
  },
  {
    t: '2026-03-01T12:04:30Z',
    event: 'phase_completed',
    phase: 'planning',
    status: 'completed',
    data: { stepCount: 8, artifacts: ['plan.md'] },
  },

  // Phase 3: Implementation
  { t: '2026-03-01T12:05:00Z', event: 'phase_started', phase: 'implementation' },

  // Permission prompt during implementation
  { t: '2026-03-01T12:07:00Z', event: 'waiting_for_input', reason: 'permission_prompt' },
  { t: '2026-03-01T12:07:30Z', event: 'input_received' },

  {
    t: '2026-03-01T12:10:00Z',
    event: 'artifact_written',
    filename: '20260301-120500Z_coder_change-summary.md',
    role: 'coder',
    roleType: 'author',
    agent: 'orchestrated-coder',
    type: 'change-summary',
    phase: 'implementation',
    iteration: undefined,
    note: undefined,
  },
  {
    t: '2026-03-01T12:10:30Z',
    event: 'phase_completed',
    phase: 'implementation',
    status: 'completed',
    data: { artifact: 'change-summary.md', qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' } },
  },

  // Phase 4: Parallel review
  { t: '2026-03-01T12:11:00Z', event: 'phase_started', phase: 'review' },
  { t: '2026-03-01T12:11:01Z', event: 'phase_decision', phase: 'parallelReview', run: true, reason: undefined },

  // Dispatch 3 reviewers
  { t: '2026-03-01T12:11:10Z', event: 'reviewer_dispatched', reviewer: 'code-reviewer' },
  { t: '2026-03-01T12:11:11Z', event: 'reviewer_dispatched', reviewer: 'silent-failure-reviewer' },
  { t: '2026-03-01T12:11:12Z', event: 'reviewer_dispatched', reviewer: 'test-reviewer' },

  // Reviewers complete
  {
    t: '2026-03-01T12:13:00Z',
    event: 'reviewer_completed',
    reviewer: 'code-reviewer',
    status: 'completed',
    criticality: 'medium',
  },
  {
    t: '2026-03-01T12:13:30Z',
    event: 'reviewer_completed',
    reviewer: 'silent-failure-reviewer',
    status: 'completed',
    criticality: 'low',
  },
  {
    t: '2026-03-01T12:14:00Z',
    event: 'reviewer_completed',
    reviewer: 'test-reviewer',
    status: 'completed',
    criticality: 'low',
  },

  // Review artifacts
  {
    t: '2026-03-01T12:14:10Z',
    event: 'artifact_written',
    filename: '20260301-121110Z_code-reviewer_code-review.md',
    role: 'code-reviewer',
    roleType: 'reviewer',
    agent: 'aspect-code-reviewer',
    type: 'code-review',
    phase: 'parallelReview',
    iteration: 1,
    note: undefined,
  },
  {
    t: '2026-03-01T12:14:11Z',
    event: 'artifact_written',
    filename: '20260301-121111Z_silent-failure-reviewer_silent-failure-review.md',
    role: 'silent-failure-reviewer',
    roleType: 'reviewer',
    agent: 'aspect-silent-failure-reviewer',
    type: 'silent-failure-review',
    phase: 'parallelReview',
    iteration: 1,
    note: undefined,
  },
  {
    t: '2026-03-01T12:14:12Z',
    event: 'artifact_written',
    filename: '20260301-121112Z_test-reviewer_test-review.md',
    role: 'test-reviewer',
    roleType: 'reviewer',
    agent: 'aspect-test-reviewer',
    type: 'test-review',
    phase: 'parallelReview',
    iteration: 1,
    note: undefined,
  },

  // Coder fix cycle
  { t: '2026-03-01T12:15:00Z', event: 'coder_fix_started', iteration: 1 },
  {
    t: '2026-03-01T12:20:00Z',
    event: 'artifact_written',
    filename: '20260301-121500Z_coder_change-summary.md',
    role: 'coder',
    roleType: 'author',
    agent: 'orchestrated-coder',
    type: 'change-summary',
    phase: 'parallelReview',
    iteration: undefined,
    note: 'Addresses aggregated findings from iteration 1',
  },
  { t: '2026-03-01T12:20:30Z', event: 'coder_fix_completed', iteration: 1 },

  // Selective re-review
  { t: '2026-03-01T12:21:00Z', event: 're_review_dispatched', reviewers: ['code-reviewer', 'test-reviewer'] },
  {
    t: '2026-03-01T12:23:00Z',
    event: 're_review_completed',
    criticalities: { 'code-reviewer': 'none', 'test-reviewer': 'none' },
  },

  // Phase 4 completed
  {
    t: '2026-03-01T12:23:30Z',
    event: 'phase_completed',
    phase: 'review',
    status: 'completed',
    data: { aggregatedCriticality: 'none', reviewRoundsUsed: 2 },
  },

  // Phase 4a: Code simplifier
  { t: '2026-03-01T12:24:00Z', event: 'phase_started', phase: 'simplifier' },
  { t: '2026-03-01T12:24:01Z', event: 'phase_decision', phase: 'codeSimplifier', run: true, reason: undefined },
  {
    t: '2026-03-01T12:25:00Z',
    event: 'artifact_written',
    filename: '20260301-122400Z_code-simplifier_code-simplifier-review.md',
    role: 'code-simplifier',
    roleType: 'reviewer',
    agent: 'pr-review-toolkit:code-simplifier',
    type: 'code-simplifier-review',
    phase: 'codeSimplifier',
    iteration: undefined,
    note: undefined,
  },
  {
    t: '2026-03-01T12:26:00Z',
    event: 'phase_completed',
    phase: 'simplifier',
    status: 'completed',
    data: { ran: true, actionableFindings: true, coderFixCycleRan: true, artifact: 'code-simplifier-review.md' },
  },

  // Phase 4b: Holistic review
  { t: '2026-03-01T12:27:00Z', event: 'phase_started', phase: 'holistic' },
  { t: '2026-03-01T12:27:01Z', event: 'phase_decision', phase: 'holisticReview', run: true, reason: undefined },
  {
    t: '2026-03-01T12:28:00Z',
    event: 'artifact_written',
    filename: '20260301-122700Z_reviewer_holistic-review.md',
    role: 'reviewer',
    roleType: 'reviewer',
    agent: 'orchestrated-reviewer',
    type: 'holistic-review',
    phase: 'holisticReview',
    iteration: undefined,
    note: undefined,
  },
  {
    t: '2026-03-01T12:29:00Z',
    event: 'phase_completed',
    phase: 'holistic',
    status: 'completed',
    data: {
      criticality: 'none',
      reReviewCriticality: undefined,
      coderFixCycleRan: false,
      reviewRoundsUsed: 1,
      artifact: 'holistic-review.md',
    },
  },

  // Summary artifact
  {
    t: '2026-03-01T12:30:00Z',
    event: 'artifact_written',
    filename: '20260301-120000Z_orchestrator_run-summary.md',
    role: 'orchestrator',
    roleType: 'orchestrator',
    agent: 'orchestrator',
    type: 'run-summary',
    phase: 'summary',
    iteration: undefined,
    note: undefined,
  },

  // Run completed
  { t: '2026-03-01T12:30:30Z', event: 'run_completed', status: 'completed' },
];

// ---------------------------------------------------------------------------
// Curated snapshot generation
//
// Each index is a 0-based event index. `foldEvents(header, events.slice(0, i+1))`
// gives the canonical status after processing events through index `i`.
//
// Selected indices represent meaningful visual transitions:
//   - run start, phase decisions
//   - each phase start / artifact / phase complete
//   - reviewer dispatches, completions, review artifacts
//   - coder fix cycle, re-review
//   - code simplifier, holistic review
//   - summary artifact, run complete
// ---------------------------------------------------------------------------
const CURATED_EVENT_INDICES = [
  0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 21, 23, 24, 27, 29, 32, 33, 35, 36, 37, 39, 40, 41, 42,
];

function generateSnapshots(hdr: RunHeader, evts: ReadonlyArray<RunEvent>, indices: number[]): CanonicalRunStatus[] {
  return indices.map((idx) => foldEvents(hdr, evts.slice(0, idx + 1)));
}

export const moderatelyComplexRun: DemoRecording = {
  name: 'Moderately complex run',
  description:
    'Full orchestrated run with architecture, planning, implementation, 3 reviewers, fix cycle, selective re-review, code simplifier, and holistic review.',
  snapshots: generateSnapshots(header, events, CURATED_EVENT_INDICES),
};

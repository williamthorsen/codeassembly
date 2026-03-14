import type { PhaseName, RoleType } from '../../../../shared/constants/role-types.js';
import { PHASE_NAMES, PHASE_ROLE, PHASE_ROLE_TYPE } from '../../../../shared/constants/role-types.js';
import { findPhaseDecision } from '../../../../shared/phase-inference.js';
import type { CanonicalRunStatus, ParallelReviewPhase } from '../../../../shared/types/canonical.js';
import { extractReviewerNames, PHASE_AGENT_ID } from '../../shared/artifact-utils.js';

// ---------------------------------------------------------------------------
// Agent assignment — bridges pipeline phases to spatial room slots
// ---------------------------------------------------------------------------

/** Room and slot assignment for a single agent. */
export interface AgentAssignment {
  agentId: string;
  role: string;
  roleType: RoleType;
  roomId: string;
  slotId: string;
}

// ---------------------------------------------------------------------------
// Phase-to-room-and-slot mapping
// ---------------------------------------------------------------------------

/** Default room and slot assignment for each pipeline phase's primary agent. */
const PHASE_ASSIGNMENTS: Partial<Record<PhaseName, { roomId: string; slotId: string }>> = {
  architecture: { roomId: 'analysis', slotId: 'analysis-ws-0' },
  planning: { roomId: 'analysis', slotId: 'analysis-ws-1' },
  implementation: { roomId: 'workshop', slotId: 'workshop-ws-0' },
  // review: handled dynamically by assignReviewers()
  simplifier: { roomId: 'review-bay', slotId: 'review-ws-3' },
  holistic: { roomId: 'review-bay', slotId: 'review-ws-4' },
  summary: { roomId: 'control', slotId: 'control-ws-0' },
};

// ---------------------------------------------------------------------------
// Character sprites
// ---------------------------------------------------------------------------

/** Character sprite ID for each agent role. From the LimeZu character set. */
export const AGENT_SPRITES: Record<string, string> = {
  orchestrator: 'Adam',
  architect: 'Alex',
  planner: 'Amelia',
  coder: 'Dan',
};

/** Reviewer sprite pool — assigned round-robin. */
export const REVIEWER_SPRITES = ['Bob', 'Ash', 'Rob', 'Edward'] as const;

/** Get the character sprite for an agent by role or reviewer index. */
export function getAgentSprite(role: string, reviewerIndex?: number): string {
  const directSprite = AGENT_SPRITES[role];
  if (directSprite !== undefined) return directSprite;

  // Reviewers, simplifier, and holistic reviewer draw from the reviewer pool
  if (reviewerIndex !== undefined) {
    return REVIEWER_SPRITES[reviewerIndex % REVIEWER_SPRITES.length] ?? REVIEWER_SPRITES[0];
  }

  // Fallback for unknown roles
  return REVIEWER_SPRITES[0];
}

// ---------------------------------------------------------------------------
// Phase-to-room mapping for orchestrator positioning
// ---------------------------------------------------------------------------

/** Map from phase to the room the orchestrator visits during that phase. */
const PHASE_ROOM: Partial<Record<PhaseName, string>> = {
  architecture: 'analysis',
  planning: 'analysis',
  implementation: 'workshop',
  review: 'review-bay',
  simplifier: 'review-bay',
  holistic: 'review-bay',
};

/**
 * Determine which room the orchestrator occupies based on the current phase.
 * Returns `'control'` when no phase is active or when the run is complete.
 */
export function deriveOrchestratorRoom(currentPhase: PhaseName | undefined, runStatus: string): string {
  if (runStatus === 'completed' || runStatus === 'failed') return 'control';
  if (currentPhase === undefined) return 'control';

  return PHASE_ROOM[currentPhase] ?? 'control';
}

// ---------------------------------------------------------------------------
// Reviewer assignment
// ---------------------------------------------------------------------------

/**
 * Assign N reviewers to sequential review bay workstation slots.
 * Reviewer names come from `extractReviewerNames()`.
 */
export function assignReviewers(reviewerNames: string[]): AgentAssignment[] {
  return reviewerNames.map((name, index) => ({
    agentId: `reviewer-${String(index)}`,
    role: name,
    roleType: PHASE_ROLE_TYPE.review,
    roomId: 'review-bay',
    slotId: `review-ws-${String(index)}`,
  }));
}

// ---------------------------------------------------------------------------
// Full assignment derivation
// ---------------------------------------------------------------------------

/**
 * Check whether a value is neither null nor undefined.
 * Local helper to avoid importing from artifact-utils (where it is not exported).
 */
function isPresent<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

/**
 * Derive all agent assignments from run status.
 * Returns one assignment per non-skipped, non-summary agent.
 *
 * Uses `PHASE_AGENT_ID` for agent IDs ("arch", "plan", "coder", "simp", "holi").
 * Uses `PHASE_ROLE` for role names ("architect", "planner", "coder", etc.).
 * Uses `PHASE_ROLE_TYPE` for role types.
 * Excludes agents for phases where `phaseDecisions[phase].run === false`.
 * Excludes the `summary` phase (orchestrator is handled separately).
 */
export function deriveAgentAssignments(status: CanonicalRunStatus): AgentAssignment[] {
  const assignments: AgentAssignment[] = [];

  for (const phase of PHASE_NAMES) {
    // Summary is excluded — the orchestrator is handled separately
    if (phase === 'summary') continue;

    // Skip phases decided to not run
    const decision = findPhaseDecision(phase, status.phaseDecisions);
    if (decision?.run === false) continue;

    if (phase === 'review') {
      const reviewerNames = deriveReviewerNames(status);
      const reviewerAssignments = assignReviewers(reviewerNames);
      assignments.push(...reviewerAssignments);
      continue;
    }

    const assignment = PHASE_ASSIGNMENTS[phase];
    const agentId = PHASE_AGENT_ID[phase];
    if (assignment === undefined || agentId === undefined) continue;

    assignments.push({
      agentId,
      role: PHASE_ROLE[phase],
      roleType: PHASE_ROLE_TYPE[phase],
      roomId: assignment.roomId,
      slotId: assignment.slotId,
    });
  }

  return assignments;
}

/**
 * Extract reviewer names from run status, falling back to a single
 * default reviewer when no parallel review data is available.
 */
function deriveReviewerNames(status: CanonicalRunStatus): string[] {
  const parallelReview: ParallelReviewPhase | undefined = status.phases.parallelReview ?? undefined;
  if (!isPresent(parallelReview)) return ['reviewer'];

  const names = extractReviewerNames(parallelReview);
  return names.length > 0 ? names : ['reviewer'];
}

/** Re-export `findCurrentPhase` for convenience in downstream mappers. */
export { findCurrentPhase } from '../../../../shared/phase-inference.js';

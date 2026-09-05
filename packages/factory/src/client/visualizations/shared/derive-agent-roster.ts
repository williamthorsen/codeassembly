import {
  type CanonicalRunStatus,
  type ParallelReviewPhase,
  PHASE_NAMES,
  PHASE_ROLE,
  PHASE_ROLE_TYPE,
  type PhaseName,
  type RoleType,
} from 'codeassembly-run-core';

import { findPhaseDecision } from '../../../shared/phase-inference.ts';
import { extractReviewerNames, isPresent, PHASE_AGENT_ID } from './artifact-utils.ts';

// -- Agent roster entry --

/** Identity record for a single agent, without spatial assignment. */
export interface AgentRosterEntry {
  agentId: string;
  role: string;
  roleType: RoleType;
  phase: PhaseName;
}

// -- Reviewer derivation --

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

/** Build roster entries for N reviewers with sequential IDs. */
function buildReviewerEntries(reviewerNames: string[]): AgentRosterEntry[] {
  return reviewerNames.map((name, index) => ({
    agentId: `reviewer-${String(index)}`,
    role: name,
    roleType: PHASE_ROLE_TYPE.review,
    phase: 'review' satisfies PhaseName,
  }));
}

// -- Full roster derivation --

/**
 * Derive the agent roster from run status. Returns one entry per
 * non-skipped, non-summary agent. The orchestrator is handled
 * separately by the scene mapper.
 */
export function deriveAgentRoster(status: CanonicalRunStatus): AgentRosterEntry[] {
  const roster: AgentRosterEntry[] = [];

  for (const phase of PHASE_NAMES) {
    // Summary is excluded -- the orchestrator is handled separately
    if (phase === 'summary') continue;

    // Skip phases decided to not run
    const decision = findPhaseDecision(phase, status.phaseDecisions);
    if (decision?.run === false) continue;

    if (phase === 'review') {
      const reviewerNames = deriveReviewerNames(status);
      const reviewerEntries = buildReviewerEntries(reviewerNames);
      roster.push(...reviewerEntries);
      continue;
    }

    const agentId = PHASE_AGENT_ID[phase];
    if (agentId === undefined) {
      console.warn(`deriveAgentRoster: no agent ID for phase "${phase}" — skipping`);
      continue;
    }

    roster.push({
      agentId,
      role: PHASE_ROLE[phase],
      roleType: PHASE_ROLE_TYPE[phase],
      phase,
    });
  }

  return roster;
}

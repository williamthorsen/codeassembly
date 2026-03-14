import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import {
  AGENT_SPRITES,
  assignReviewers,
  deriveAgentAssignments,
  deriveOrchestratorRoom,
  getAgentSprite,
  REVIEWER_SPRITES,
} from '../agent-assignments.js';

// ---------------------------------------------------------------------------
// deriveAgentAssignments
// ---------------------------------------------------------------------------

describe(deriveAgentAssignments, () => {
  it('produces assignments for all agents in a full completed run', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const assignments = deriveAgentAssignments(status);

    // arch, plan, coder, 2 reviewers, simp, holi = 7
    expect(assignments).toHaveLength(7);

    const ids = assignments.map((a) => a.agentId);
    expect(ids).toContain('arch');
    expect(ids).toContain('plan');
    expect(ids).toContain('coder');
    expect(ids).toContain('reviewer-0');
    expect(ids).toContain('reviewer-1');
    expect(ids).toContain('simp');
    expect(ids).toContain('holi');
  });

  it('assigns correct rooms and slots for non-review phases', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });

    const assignments = deriveAgentAssignments(status);

    const arch = assignments.find((a) => a.agentId === 'arch');
    expect(arch).toEqual(
      expect.objectContaining({ roomId: 'analysis', slotId: 'analysis-ws-0', role: 'architect', roleType: 'analyst' }),
    );

    const plan = assignments.find((a) => a.agentId === 'plan');
    expect(plan).toEqual(
      expect.objectContaining({ roomId: 'analysis', slotId: 'analysis-ws-1', role: 'planner', roleType: 'planner' }),
    );

    const coder = assignments.find((a) => a.agentId === 'coder');
    expect(coder).toEqual(
      expect.objectContaining({ roomId: 'workshop', slotId: 'workshop-ws-0', role: 'coder', roleType: 'author' }),
    );

    const simp = assignments.find((a) => a.agentId === 'simp');
    expect(simp).toEqual(
      expect.objectContaining({
        roomId: 'review-bay',
        slotId: 'review-ws-3',
        role: 'simplifier',
        roleType: 'reviewer',
      }),
    );

    const holi = assignments.find((a) => a.agentId === 'holi');
    expect(holi).toEqual(
      expect.objectContaining({
        roomId: 'review-bay',
        slotId: 'review-ws-4',
        role: 'holistic reviewer',
        roleType: 'reviewer',
      }),
    );
  });

  it('excludes the architect when architecture is skipped', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
      phaseDecisions: {
        architecture: { run: false, reason: 'Low impact change' },
      },
    });

    const assignments = deriveAgentAssignments(status);
    const archAssignment = assignments.find((a) => a.agentId === 'arch');
    expect(archAssignment).toBeUndefined();
  });

  it('produces one reviewer assignment when no review data exists', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });

    const assignments = deriveAgentAssignments(status);
    const reviewers = assignments.filter((a) => a.agentId.startsWith('reviewer-'));
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0]?.agentId).toBe('reviewer-0');
    expect(reviewers[0]?.role).toBe('reviewer');
    expect(reviewers[0]?.slotId).toBe('review-ws-0');
  });

  it('produces correct reviewer count from parallel review data', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: createInProgressReviewPhases(),
    });

    const assignments = deriveAgentAssignments(status);
    const reviewers = assignments.filter((a) => a.agentId.startsWith('reviewer-'));

    // createInProgressReviewPhases has 1 reviewer: correctness-reviewer
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0]?.role).toBe('correctness-reviewer');
    expect(reviewers[0]?.slotId).toBe('review-ws-0');
  });

  it('assigns sequential slots for multiple reviewers', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        parallelReview: {
          aggregatedCriticality: 'low',
          reviewRoundsUsed: 1,
          reviewers: {
            'code-reviewer': {
              ran: true,
              status: 'completed',
              criticality: 'low',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
            'security-reviewer': {
              ran: true,
              status: 'completed',
              criticality: 'none',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
            'test-reviewer': {
              ran: true,
              status: 'completed',
              criticality: 'none',
              reason: undefined,
              reReviewCriticality: undefined,
              reReviewError: undefined,
            },
          },
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
        review: undefined,
        codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
        holisticReview: {
          status: 'completed',
          criticality: 'none',
          reReviewCriticality: undefined,
          coderFixCycleRan: false,
          reviewRoundsUsed: 1,
          artifact: undefined,
        },
      },
    });

    const assignments = deriveAgentAssignments(status);
    const reviewers = assignments.filter((a) => a.agentId.startsWith('reviewer-'));

    expect(reviewers).toHaveLength(3);
    expect(reviewers[0]?.slotId).toBe('review-ws-0');
    expect(reviewers[1]?.slotId).toBe('review-ws-1');
    expect(reviewers[2]?.slotId).toBe('review-ws-2');
  });

  it('never includes summary phase in assignments', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const assignments = deriveAgentAssignments(status);
    const summaryAgent = assignments.find((a) => a.role === 'orchestrator');
    expect(summaryAgent).toBeUndefined();
  });

  it('assigns all agents to valid slot IDs (no undefined slots)', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const assignments = deriveAgentAssignments(status);
    for (const assignment of assignments) {
      expect(assignment.slotId).toBeTruthy();
      expect(assignment.roomId).toBeTruthy();
      expect(assignment.agentId).toBeTruthy();
      expect(assignment.role).toBeTruthy();
      expect(assignment.roleType).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// assignReviewers
// ---------------------------------------------------------------------------

describe(assignReviewers, () => {
  it('assigns a single reviewer to review-ws-0', () => {
    const result = assignReviewers(['correctness-reviewer']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      agentId: 'reviewer-0',
      role: 'correctness-reviewer',
      roleType: 'reviewer',
      roomId: 'review-bay',
      slotId: 'review-ws-0',
    });
  });

  it('assigns multiple reviewers to sequential slots', () => {
    const result = assignReviewers(['alpha', 'beta', 'gamma']);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.slotId)).toEqual(['review-ws-0', 'review-ws-1', 'review-ws-2']);
    expect(result.map((r) => r.agentId)).toEqual(['reviewer-0', 'reviewer-1', 'reviewer-2']);
    expect(result.map((r) => r.role)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns an empty array for no reviewers', () => {
    expect(assignReviewers([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveOrchestratorRoom
// ---------------------------------------------------------------------------

describe(deriveOrchestratorRoom, () => {
  it('returns control when no phase is active', () => {
    expect(deriveOrchestratorRoom(undefined, 'in_progress')).toBe('control');
  });

  it('returns control when run is completed', () => {
    expect(deriveOrchestratorRoom('implementation', 'completed')).toBe('control');
  });

  it('returns control when run has failed', () => {
    expect(deriveOrchestratorRoom('review', 'failed')).toBe('control');
  });

  it('returns analysis during architecture phase', () => {
    expect(deriveOrchestratorRoom('architecture', 'in_progress')).toBe('analysis');
  });

  it('returns analysis during planning phase', () => {
    expect(deriveOrchestratorRoom('planning', 'in_progress')).toBe('analysis');
  });

  it('returns workshop during implementation phase', () => {
    expect(deriveOrchestratorRoom('implementation', 'in_progress')).toBe('workshop');
  });

  it('returns review-bay during review phase', () => {
    expect(deriveOrchestratorRoom('review', 'in_progress')).toBe('review-bay');
  });

  it('returns review-bay during simplifier phase', () => {
    expect(deriveOrchestratorRoom('simplifier', 'in_progress')).toBe('review-bay');
  });

  it('returns review-bay during holistic phase', () => {
    expect(deriveOrchestratorRoom('holistic', 'in_progress')).toBe('review-bay');
  });

  it('returns control during summary phase', () => {
    expect(deriveOrchestratorRoom('summary', 'in_progress')).toBe('control');
  });
});

// ---------------------------------------------------------------------------
// getAgentSprite
// ---------------------------------------------------------------------------

describe(getAgentSprite, () => {
  it('returns the correct sprite for known roles', () => {
    expect(getAgentSprite('orchestrator')).toBe('Adam');
    expect(getAgentSprite('architect')).toBe('Alex');
    expect(getAgentSprite('planner')).toBe('Amelia');
    expect(getAgentSprite('coder')).toBe('Dan');
  });

  it('assigns reviewer sprites round-robin by index', () => {
    expect(getAgentSprite('correctness-reviewer', 0)).toBe('Bob');
    expect(getAgentSprite('security-reviewer', 1)).toBe('Ash');
    expect(getAgentSprite('test-reviewer', 2)).toBe('Rob');
    expect(getAgentSprite('perf-reviewer', 3)).toBe('Edward');
  });

  it('wraps around when reviewer index exceeds pool size', () => {
    expect(getAgentSprite('reviewer-4', 4)).toBe('Bob');
    expect(getAgentSprite('reviewer-5', 5)).toBe('Ash');
  });

  it('uses first reviewer sprite as fallback for unknown roles without index', () => {
    expect(getAgentSprite('unknown-role')).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// Sprite constants
// ---------------------------------------------------------------------------

describe('AGENT_SPRITES', () => {
  it('contains entries for orchestrator, architect, planner, and coder', () => {
    expect(Object.keys(AGENT_SPRITES).toSorted()).toEqual(['architect', 'coder', 'orchestrator', 'planner']);
  });
});

describe('REVIEWER_SPRITES', () => {
  it('contains four reviewer sprite names', () => {
    expect(REVIEWER_SPRITES).toHaveLength(4);
    expect([...REVIEWER_SPRITES]).toEqual(['Bob', 'Ash', 'Rob', 'Edward']);
  });
});

import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../__test-helpers__/fixtures.js';
import { deriveAgentRoster } from '../derive-agent-roster.js';

// -- deriveAgentRoster --

describe(deriveAgentRoster, () => {
  it('produces entries for all agents in a full completed run', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const roster = deriveAgentRoster(status);

    // arch, plan, coder, 2 reviewers, simp, holi = 7
    expect(roster).toHaveLength(7);

    const ids = roster.map((e) => e.agentId);
    expect(ids).toContain('arch');
    expect(ids).toContain('plan');
    expect(ids).toContain('coder');
    expect(ids).toContain('reviewer-0');
    expect(ids).toContain('reviewer-1');
    expect(ids).toContain('simp');
    expect(ids).toContain('holi');
  });

  it('assigns correct roles and role types for non-review phases', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });

    const roster = deriveAgentRoster(status);

    const arch = roster.find((e) => e.agentId === 'arch');
    expect(arch).toEqual(expect.objectContaining({ role: 'architect', roleType: 'analyst', phase: 'architecture' }));

    const plan = roster.find((e) => e.agentId === 'plan');
    expect(plan).toEqual(expect.objectContaining({ role: 'planner', roleType: 'planner', phase: 'planning' }));

    const coder = roster.find((e) => e.agentId === 'coder');
    expect(coder).toEqual(expect.objectContaining({ role: 'coder', roleType: 'author', phase: 'implementation' }));

    const simp = roster.find((e) => e.agentId === 'simp');
    expect(simp).toEqual(expect.objectContaining({ role: 'simplifier', roleType: 'reviewer', phase: 'simplifier' }));

    const holi = roster.find((e) => e.agentId === 'holi');
    expect(holi).toEqual(
      expect.objectContaining({ role: 'holistic reviewer', roleType: 'reviewer', phase: 'holistic' }),
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

    const roster = deriveAgentRoster(status);
    const archEntry = roster.find((e) => e.agentId === 'arch');
    expect(archEntry).toBeUndefined();
  });

  it('produces one reviewer entry when no review data exists', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: emptyPhases(),
    });

    const roster = deriveAgentRoster(status);
    const reviewers = roster.filter((e) => e.agentId.startsWith('reviewer-'));
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0]?.agentId).toBe('reviewer-0');
    expect(reviewers[0]?.role).toBe('reviewer');
    expect(reviewers[0]?.phase).toBe('review');
  });

  it('produces correct reviewer count from parallel review data', () => {
    const status = createMockRunStatus({
      status: 'in_progress',
      phases: createInProgressReviewPhases(),
    });

    const roster = deriveAgentRoster(status);
    const reviewers = roster.filter((e) => e.agentId.startsWith('reviewer-'));

    // createInProgressReviewPhases has 1 reviewer: correctness-reviewer
    expect(reviewers).toHaveLength(1);
    expect(reviewers[0]?.role).toBe('correctness-reviewer');
    expect(reviewers[0]?.phase).toBe('review');
  });

  it('assigns sequential IDs for multiple reviewers', () => {
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

    const roster = deriveAgentRoster(status);
    const reviewers = roster.filter((e) => e.agentId.startsWith('reviewer-'));

    expect(reviewers).toHaveLength(3);
    expect(reviewers[0]?.agentId).toBe('reviewer-0');
    expect(reviewers[1]?.agentId).toBe('reviewer-1');
    expect(reviewers[2]?.agentId).toBe('reviewer-2');
  });

  it('never includes summary phase in roster', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const roster = deriveAgentRoster(status);
    const summaryAgent = roster.find((e) => e.role === 'orchestrator');
    expect(summaryAgent).toBeUndefined();
  });

  it('assigns all agents valid identity fields', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const roster = deriveAgentRoster(status);
    for (const entry of roster) {
      expect(entry.agentId).toBeTruthy();
      expect(entry.role).toBeTruthy();
      expect(entry.roleType).toBeTruthy();
      expect(entry.phase).toBeTruthy();
    }
  });

  it('assigns review phase to all reviewer entries', () => {
    const status = createMockRunStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: createCompletedRunPhases(),
    });

    const roster = deriveAgentRoster(status);
    const reviewers = roster.filter((e) => e.agentId.startsWith('reviewer-'));

    for (const reviewer of reviewers) {
      expect(reviewer.phase).toBe('review');
      expect(reviewer.roleType).toBe('reviewer');
    }
  });
});

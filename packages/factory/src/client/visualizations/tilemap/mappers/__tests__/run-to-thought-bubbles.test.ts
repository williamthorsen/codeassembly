import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import { mapRunToThoughtBubbles } from '../run-to-thought-bubbles.js';

describe('mapRunToThoughtBubbles', () => {
  describe('completed run', () => {
    it('produces bubbles for all non-skipped agents with appropriate text', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Should have bubbles for: arch, plan, coder, 2 reviewers, simp, holi
      expect(bubbles.length).toBeGreaterThanOrEqual(7);

      // Architect should have completed text
      const archBubble = bubbles.find((b) => b.agentId === 'arch');
      expect(archBubble).toBeDefined();
      expect(archBubble?.texts.length).toBeGreaterThanOrEqual(1);
      expect(archBubble?.texts[0]?.category).toBe('task');
      expect(archBubble?.severity).toBe('normal');

      // Planner should have step count
      const planBubble = bubbles.find((b) => b.agentId === 'plan');
      expect(planBubble).toBeDefined();
      expect(planBubble?.texts.some((t) => t.content.includes('7 steps'))).toBe(true);

      // Coder should show implementation complete
      const coderBubble = bubbles.find((b) => b.agentId === 'coder');
      expect(coderBubble).toBeDefined();
      expect(coderBubble?.texts.some((t) => t.content.includes('Implementation complete'))).toBe(true);

      // Reviewers should show review complete
      const reviewerBubbles = bubbles.filter((b) => b.agentId.startsWith('reviewer-'));
      expect(reviewerBubbles.length).toBe(2);
      for (const rb of reviewerBubbles) {
        expect(rb.texts.some((t) => t.content.includes('Review complete'))).toBe(true);
      }
    });

    it('sets all stagger offsets with consistent spacing', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // First agent should have 0 offset
      expect(bubbles[0]?.staggerOffsetMs).toBe(0);

      // Each subsequent agent should have a larger offset
      for (let i = 1; i < bubbles.length; i++) {
        const current = bubbles[i]?.staggerOffsetMs;
        const previous = bubbles[i - 1]?.staggerOffsetMs;
        if (current !== undefined && previous !== undefined) {
          expect(current).toBeGreaterThan(previous);
        }
      }
    });
  });

  describe('in-progress run with active architecture phase', () => {
    it('shows architect working and others idle', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Architect should be working
      const archBubble = bubbles.find((b) => b.agentId === 'arch');
      expect(archBubble).toBeDefined();
      expect(archBubble?.texts.some((t) => t.category === 'task')).toBe(true);
      expect(archBubble?.texts.some((t) => t.content.includes('working'))).toBe(true);

      // Planner should be idle
      const planBubble = bubbles.find((b) => b.agentId === 'plan');
      expect(planBubble).toBeDefined();
      expect(planBubble?.texts.some((t) => t.category === 'idle')).toBe(true);

      // Coder should be idle
      const coderBubble = bubbles.find((b) => b.agentId === 'coder');
      expect(coderBubble).toBeDefined();
      expect(coderBubble?.texts.some((t) => t.category === 'idle')).toBe(true);
    });
  });

  describe('in-progress run with active implementation phase', () => {
    it('shows architect and planner completed, coder working, reviewers idle', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 5, artifacts: ['plan.md'] },
        },
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Architect should show completed status
      const archBubble = bubbles.find((b) => b.agentId === 'arch');
      expect(archBubble).toBeDefined();
      expect(archBubble?.texts.some((t) => t.content.includes('high'))).toBe(true);

      // Planner should show step count
      const planBubble = bubbles.find((b) => b.agentId === 'plan');
      expect(planBubble).toBeDefined();
      expect(planBubble?.texts.some((t) => t.content.includes('5 steps'))).toBe(true);

      // Coder should be working
      const coderBubble = bubbles.find((b) => b.agentId === 'coder');
      expect(coderBubble).toBeDefined();
      expect(coderBubble?.texts.some((t) => t.category === 'task')).toBe(true);

      // Reviewers should be idle
      const reviewerBubbles = bubbles.filter((b) => b.agentId.startsWith('reviewer-'));
      expect(reviewerBubbles.length).toBeGreaterThanOrEqual(1);
      for (const rb of reviewerBubbles) {
        expect(rb.texts.some((t) => t.category === 'idle')).toBe(true);
      }
    });
  });

  describe('run with review findings', () => {
    it('shows finding summaries with correct severity', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'medium', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'high',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'high',
                reason: 'missing null check in parser',
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
                reason: 'unvalidated user input',
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
          codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
          holisticReview: {
            status: 'completed',
            criticality: 'medium',
            reReviewCriticality: undefined,
            coderFixCycleRan: false,
            reviewRoundsUsed: 1,
            artifact: undefined,
          },
        },
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Correctness reviewer should have high severity (red border)
      const correctnessReviewer = bubbles.find((b) => b.agentRole === 'correctness-reviewer');
      expect(correctnessReviewer).toBeDefined();
      expect(correctnessReviewer?.severity).toBe('critical');
      expect(correctnessReviewer?.texts.some((t) => t.category === 'finding' && t.content.includes('Found F'))).toBe(
        true,
      );

      // Security reviewer should have warning severity (amber border)
      const securityReviewer = bubbles.find((b) => b.agentRole === 'security-reviewer');
      expect(securityReviewer).toBeDefined();
      expect(securityReviewer?.severity).toBe('warning');
      expect(securityReviewer?.texts.some((t) => t.category === 'finding' && t.content.includes('Found W'))).toBe(true);

      // Holistic reviewer should have warning severity
      const holiBubble = bubbles.find((b) => b.agentId === 'holi');
      expect(holiBubble).toBeDefined();
      expect(holiBubble?.severity).toBe('warning');
    });
  });

  describe('failed run', () => {
    it('shows concerned state text for all agents', () => {
      const status = createMockRunStatus({
        status: 'failed',
        reason: 'Implementation failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
          implementation: { status: 'failed', artifact: undefined, qualityGates: undefined },
        },
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // All agents should show "Something went wrong..."
      for (const bubble of bubbles) {
        expect(bubble.texts.some((t) => t.content.includes('Something went wrong'))).toBe(true);
      }
    });
  });

  describe('run with parallel reviewers', () => {
    it('produces separate bubbles for each reviewer', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Should have at least one reviewer bubble
      const reviewerBubbles = bubbles.filter((b) => b.agentId.startsWith('reviewer-'));
      expect(reviewerBubbles.length).toBeGreaterThanOrEqual(1);

      // Each reviewer should have a unique agent ID
      const ids = reviewerBubbles.map((b) => b.agentId);
      expect(new Set(ids).size).toBe(ids.length);

      // All reviewer bubbles should have phase 'review'
      for (const rb of reviewerBubbles) {
        expect(rb.phase).toBe('review');
        expect(rb.roleType).toBe('reviewer');
      }
    });

    it('handles multiple named reviewers with individual stagger offsets', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);
      const reviewerBubbles = bubbles.filter((b) => b.agentId.startsWith('reviewer-'));

      expect(reviewerBubbles.length).toBe(2);

      // Each reviewer should have a different stagger offset
      const offsets = reviewerBubbles.map((b) => b.staggerOffsetMs);
      expect(offsets[0]).not.toBe(offsets[1]);
    });
  });

  describe('empty/minimal run', () => {
    it('handles empty phases gracefully', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Should still produce bubbles for all expected agents
      expect(bubbles.length).toBeGreaterThanOrEqual(5);

      // All bubbles should have valid structure
      for (const bubble of bubbles) {
        expect(bubble.agentId).toBeTruthy();
        expect(bubble.agentRole).toBeTruthy();
        expect(bubble.roleType).toBeTruthy();
        expect(bubble.texts.length).toBeGreaterThanOrEqual(1);
        expect(bubble.severity).toBe('normal');
        expect(typeof bubble.staggerOffsetMs).toBe('number');
      }
    });

    it('handles undefined artifacts gracefully', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: undefined,
      });

      const bubbles = mapRunToThoughtBubbles(status);
      expect(bubbles.length).toBeGreaterThanOrEqual(5);

      // No bubble should have progress text since there are no artifacts
      for (const bubble of bubbles) {
        expect(bubble.texts.every((t) => t.category !== 'progress')).toBe(true);
      }
    });
  });

  describe('skipped phases', () => {
    it('excludes agents for phases decided to not run', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: {
          architecture: { run: false, reason: 'Low impact change' },
        },
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // Architect bubble should not exist
      const archBubble = bubbles.find((b) => b.agentId === 'arch');
      expect(archBubble).toBeUndefined();
    });
  });

  describe('waiting for input', () => {
    it('shows waiting text when agent is waiting for input', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        waitingForInput: 'permission_prompt',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
        },
      });

      const bubbles = mapRunToThoughtBubbles(status);

      // The current phase (implementation) agent should show waiting
      const coderBubble = bubbles.find((b) => b.agentId === 'coder');
      expect(coderBubble).toBeDefined();
      expect(coderBubble?.texts.some((t) => t.category === 'waiting')).toBe(true);
    });
  });

  describe('severity mapping', () => {
    it('maps code simplifier actionable findings to warning severity', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'low', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 2, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'none',
            reviewRoundsUsed: 1,
            reviewers: {},
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
          codeSimplifier: {
            ran: true,
            actionableFindings: true,
            coderFixCycleRan: false,
            artifact: 'simplifier.md',
          },
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

      const bubbles = mapRunToThoughtBubbles(status);
      const simpBubble = bubbles.find((b) => b.agentId === 'simp');
      expect(simpBubble).toBeDefined();
      expect(simpBubble?.severity).toBe('warning');
    });
  });

  describe('role type and phase assignment', () => {
    it('assigns correct role types to all agents', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const bubbles = mapRunToThoughtBubbles(status);

      const archBubble = bubbles.find((b) => b.agentId === 'arch');
      expect(archBubble?.roleType).toBe('analyst');
      expect(archBubble?.phase).toBe('architecture');

      const planBubble = bubbles.find((b) => b.agentId === 'plan');
      expect(planBubble?.roleType).toBe('planner');
      expect(planBubble?.phase).toBe('planning');

      const coderBubble = bubbles.find((b) => b.agentId === 'coder');
      expect(coderBubble?.roleType).toBe('author');
      expect(coderBubble?.phase).toBe('implementation');

      const reviewerBubbles = bubbles.filter((b) => b.agentId.startsWith('reviewer-'));
      for (const rb of reviewerBubbles) {
        expect(rb.roleType).toBe('reviewer');
        expect(rb.phase).toBe('review');
      }

      const simpBubble = bubbles.find((b) => b.agentId === 'simp');
      expect(simpBubble?.roleType).toBe('reviewer');
      expect(simpBubble?.phase).toBe('simplifier');

      const holiBubble = bubbles.find((b) => b.agentId === 'holi');
      expect(holiBubble?.roleType).toBe('reviewer');
      expect(holiBubble?.phase).toBe('holistic');
    });
  });
});

import { describe, expect, it } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus, emptyPhases } from '../../../../__test-helpers__/fixtures.js';
import type { AgentConfig } from '../../mappers/run-to-scene.js';
import { resolveAgentStates } from '../agent-state-resolver.js';

function createAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    role: 'architect',
    roleType: 'analyst',
    stationIndex: 0,
    stackOffset: 0,
    ...overrides,
  };
}

describe('resolveAgentStates', () => {
  describe('terminal run states', () => {
    it('assigns celebrating to all agents when run is completed', () => {
      const agents = [
        createAgent({ role: 'architect', stationIndex: 0 }),
        createAgent({ role: 'planner', stationIndex: 1 }),
      ];
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const result = resolveAgentStates(agents, status);

      expect(result).toEqual([
        { role: 'architect', stationIndex: 0, animationState: 'celebrating' },
        { role: 'planner', stationIndex: 1, animationState: 'celebrating' },
      ]);
    });

    it('assigns concerned to all agents when run is failed', () => {
      const agents = [
        createAgent({ role: 'architect', stationIndex: 0 }),
        createAgent({ role: 'coder', stationIndex: 2 }),
      ];
      const status = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result).toEqual([
        { role: 'architect', stationIndex: 0, animationState: 'concerned' },
        { role: 'coder', stationIndex: 2, animationState: 'concerned' },
      ]);
    });
  });

  describe('in-progress phase detection', () => {
    it('assigns working to agent whose architecture phase is in_progress', () => {
      const agents = [createAgent({ role: 'architect', stationIndex: 0 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });

    it('assigns working to agent whose planning phase is in_progress', () => {
      const agents = [createAgent({ role: 'planner', roleType: 'planner', stationIndex: 1 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });

    it('assigns working to agent whose implementation phase is in_progress', () => {
      const agents = [createAgent({ role: 'coder', roleType: 'author', stationIndex: 2 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });

    it('assigns working to agent whose holistic review phase is in_progress', () => {
      const agents = [createAgent({ role: 'holistic-reviewer', roleType: 'reviewer', stationIndex: 5 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          holisticReview: {
            status: 'in_progress',
            criticality: undefined,
            reReviewCriticality: undefined,
            coderFixCycleRan: false,
            reviewRoundsUsed: 0,
            artifact: undefined,
          },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });
  });

  describe('idle fallback', () => {
    it('assigns idle to agent whose phase is completed', () => {
      const agents = [createAgent({ role: 'architect', stationIndex: 0 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('idle');
    });

    it('assigns idle to agent when no phases are active', () => {
      const agents = [createAgent({ role: 'architect', stationIndex: 0 })];
      const status = createMockRunStatus({ status: 'in_progress' });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('idle');
    });
  });

  it('returns empty array for empty agent list', () => {
    const status = createMockRunStatus({ status: 'in_progress' });

    const result = resolveAgentStates([], status);

    expect(result).toEqual([]);
  });

  it('preserves role and stationIndex from input agents', () => {
    const agents = [createAgent({ role: 'custom-agent', stationIndex: 4 })];
    const status = createMockRunStatus({ status: 'in_progress' });

    const result = resolveAgentStates(agents, status);

    expect(result[0]).toEqual({
      role: 'custom-agent',
      stationIndex: 4,
      animationState: 'idle',
    });
  });

  describe('parallelReview phase detection', () => {
    it('assigns working to review agents when parallelReview has running reviewers', () => {
      const agents = [createAgent({ role: 'correctness-reviewer', roleType: 'reviewer', stationIndex: 3 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
                ran: true,
                status: undefined,
                criticality: undefined,
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });

    it('assigns idle to review agents when all parallelReview reviewers are completed', () => {
      const agents = [createAgent({ role: 'correctness-reviewer', roleType: 'reviewer', stationIndex: 3 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'correctness-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('idle');
    });
  });

  describe('needs_manual_review run status', () => {
    it('assigns working to agent whose phase is in_progress during needs_manual_review', () => {
      const agents = [createAgent({ role: 'coder', roleType: 'author', stationIndex: 2 })];
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('working');
    });

    it('assigns idle to agent whose phase is completed during needs_manual_review', () => {
      const agents = [
        createAgent({ role: 'architect', stationIndex: 0 }),
        createAgent({ role: 'planner', roleType: 'planner', stationIndex: 1 }),
      ];
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('idle');
      expect(result[1]?.animationState).toBe('working');
    });
  });

  describe('out-of-bounds stationIndex', () => {
    it('assigns idle to agent with stationIndex beyond PHASE_NAMES length', () => {
      const agents = [createAgent({ role: 'unknown-agent', stationIndex: 99 })];
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const result = resolveAgentStates(agents, status);

      expect(result[0]?.animationState).toBe('idle');
    });
  });
});

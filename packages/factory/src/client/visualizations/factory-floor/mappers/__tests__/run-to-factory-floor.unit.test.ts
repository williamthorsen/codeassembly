import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
} from '../../../../../__test-helpers__/fixtures.js';
import { mapRunToFactoryFloor } from '../run-to-factory-floor.js';

describe(mapRunToFactoryFloor, () => {
  describe('stations', () => {
    it('produces 7 stations for all phases', () => {
      const status = createMockRunStatus();
      const config = mapRunToFactoryFloor(status);
      expect(config.stations).toHaveLength(7);
    });

    it('marks skipped phases as absent', () => {
      const status = createMockRunStatus({
        phaseDecisions: { architecture: { run: false, reason: 'skip' } },
      });
      const config = mapRunToFactoryFloor(status);
      expect(config.stations[0]?.absent).toBe(true);
    });
  });

  describe('orchestrator', () => {
    it('positions at station 6 when completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });
      const config = mapRunToFactoryFloor(status);
      expect(config.orchestrator.stationIndex).toBe(6);
      expect(config.orchestrator.celebrating).toBe(true);
    });

    it('positions at current phase station during in_progress', () => {
      const status = createMockRunStatus({ status: 'in_progress' });
      const config = mapRunToFactoryFloor(status);
      // No phases completed yet, so current phase should be architecture (station 0)
      expect(config.orchestrator.stationIndex).toBe(0);
    });

    it('returns -1 when run is failed', () => {
      const status = createMockRunStatus({ status: 'failed' });
      const config = mapRunToFactoryFloor(status);
      expect(config.orchestrator.stationIndex).toBe(-1);
    });
  });

  describe('agents', () => {
    it('produces agents for non-summary phases', () => {
      const status = createMockRunStatus();
      const config = mapRunToFactoryFloor(status);
      // Should have agents for: architecture(0), planning(1), implementation(2),
      // review(3), simplifier(4), holistic(5)
      expect(config.agents.length).toBeGreaterThanOrEqual(6);
    });

    it('does not produce an agent for the summary phase', () => {
      const status = createMockRunStatus();
      const config = mapRunToFactoryFloor(status);
      const summaryAgent = config.agents.find((a) => a.stationIndex === 6);
      expect(summaryAgent).toBeUndefined();
    });

    it('all agents celebrate when run is completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });
      const config = mapRunToFactoryFloor(status);
      for (const agent of config.agents) {
        expect(agent.state).toBe('celebrating');
      }
    });

    it('all agents are concerned when run is failed', () => {
      const status = createMockRunStatus({ status: 'failed' });
      const config = mapRunToFactoryFloor(status);
      for (const agent of config.agents) {
        expect(agent.state).toBe('concerned');
      }
    });
  });

  describe('parallel review with multiple reviewers', () => {
    it('creates separate agent configs for each reviewer', () => {
      const status = createMockRunStatus({
        phases: createInProgressReviewPhases(),
      });

      // Add more reviewers
      const phases = status.phases;
      if (phases.parallelReview?.reviewers !== undefined) {
        phases.parallelReview.reviewers['security-reviewer'] = {
          ran: true,
          status: undefined,
          criticality: undefined,
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        };
        phases.parallelReview.reviewers['test-reviewer'] = {
          ran: true,
          status: undefined,
          criticality: undefined,
          reason: undefined,
          reReviewCriticality: undefined,
          reReviewError: undefined,
        };
      }

      const config = mapRunToFactoryFloor(status);
      const reviewerAgents = config.agents.filter((a) => a.stationIndex === 3);

      expect(reviewerAgents).toHaveLength(3);
      expect(reviewerAgents[0]?.slotIndex).toBe(0);
      expect(reviewerAgents[1]?.slotIndex).toBe(1);
      expect(reviewerAgents[2]?.slotIndex).toBe(2);
    });
  });

  describe('completed run', () => {
    it('produces a full scene config', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
        artifacts: [
          {
            phase: 'architecture',
            type: 'architecture',
            agent: 'arch',
            role: 'analyst',
            filename: 'arch.md',
            roleType: 'analyst',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            phase: 'planning',
            type: 'plan',
            agent: 'plan',
            role: 'planner',
            filename: 'plan.md',
            roleType: 'planner',
            createdAt: '2026-01-01T00:20:00Z',
          },
          {
            phase: 'implementation',
            type: 'code',
            agent: 'coder',
            role: 'coder',
            filename: 'code.md',
            roleType: 'author',
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const config = mapRunToFactoryFloor(status);

      expect(config.orchestrator.stationIndex).toBe(6);
      expect(config.orchestrator.celebrating).toBe(true);
      expect(config.stations).toHaveLength(7);
      expect(config.agents.length).toBeGreaterThanOrEqual(6);
      expect(config.artifacts.length).toBeGreaterThan(0);
    });
  });

  describe('no gates', () => {
    it('factory-floor config does not include gates', () => {
      const status = createMockRunStatus();
      const config = mapRunToFactoryFloor(status);
      // FactoryFloorSceneConfig should not have a gates property
      expect('gates' in config).toBe(false);
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import { mapRunToCatwalk } from '../run-to-catwalk.js';

describe('mapRunToCatwalk', () => {
  describe('empty in_progress run', () => {
    it('infers architecture as current phase, with arch agent working and all others idle', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToCatwalk(status);

      // 7 stations
      expect(config.stations).toHaveLength(7);

      // Architecture agent should be working (inferred current phase)
      const archAgent = config.agents.find((a) => a.id === 'arch');
      expect(archAgent?.state).toBe('working');

      // All other agents should be idle
      const nonArchAgents = config.agents.filter((a) => a.id !== 'arch');
      for (const agent of nonArchAgents) {
        expect(agent.state).toBe('idle');
      }

      // Orchestrator at station 0 (architecture is inferred current)
      expect(config.orchestrator.stationIndex).toBe(0);

      // All 6 gates closed (no phases evaluated)
      expect(config.gates).toHaveLength(6);
      for (const gate of config.gates) {
        expect(gate.open).toBe(false);
      }

      // No artifacts
      expect(config.artifacts).toHaveLength(0);
    });
  });

  describe('architecture in progress', () => {
    it('shows arch agent as working, orchestrator at station 0, and orchestrator.working is true', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToCatwalk(status);

      // Architecture agent should be working (current phase inferred as architecture, no data yet)
      const archAgent = config.agents.find((a) => a.id === 'arch');
      expect(archAgent).toBeDefined();
      expect(archAgent?.state).toBe('working');

      // Orchestrator at station 0
      expect(config.orchestrator.stationIndex).toBe(0);
      expect(config.orchestrator.working).toBe(true);

      // All gates closed
      for (const gate of config.gates) {
        expect(gate.open).toBe(false);
      }
    });
  });

  describe('implementation complete, review in progress', () => {
    it('shows coder resting, reviewer working, orchestrator at station 3, gates 0-2 open', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const config = mapRunToCatwalk(status);

      // Coder agent should be resting
      const coderAgent = config.agents.find((a) => a.id === 'coder');
      expect(coderAgent).toBeDefined();
      expect(coderAgent?.state).toBe('resting');

      // Reviewer agent(s) should be working
      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents.length).toBeGreaterThanOrEqual(1);
      for (const reviewer of reviewerAgents) {
        expect(reviewer.state).toBe('working');
      }

      // Orchestrator at station 3 (review)
      expect(config.orchestrator.stationIndex).toBe(3);

      // Gates 0, 1, 2 should be open (architecture, planning, implementation evaluated)
      expect(config.gates[0]?.open).toBe(true);
      expect(config.gates[1]?.open).toBe(true);
      expect(config.gates[2]?.open).toBe(true);

      // Gates 3, 4, 5 should be closed (review in progress, simplifier/holistic not reached)
      expect(config.gates[3]?.open).toBe(false);
      expect(config.gates[4]?.open).toBe(false);
      expect(config.gates[5]?.open).toBe(false);
    });
  });

  describe('completed run', () => {
    it('shows all agents celebrating, orchestrator at station 6, all gates open', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = mapRunToCatwalk(status);

      // All agents celebrating
      for (const agent of config.agents) {
        expect(agent.state).toBe('celebrating');
      }

      // Orchestrator at final station
      expect(config.orchestrator.stationIndex).toBe(6);

      // All 6 gates open
      for (const gate of config.gates) {
        expect(gate.open).toBe(true);
      }
    });
  });

  describe('failed run', () => {
    it('shows all agents as concerned regardless of phase progress', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
        },
      });

      const config = mapRunToCatwalk(status);

      for (const agent of config.agents) {
        expect(agent.state).toBe('concerned');
      }
    });
  });

  describe('absent phase', () => {
    it('marks architecture station as absent and skipped, gate at index 0 is open', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: {
          architecture: { run: false, reason: 'not needed' },
        },
      });

      const config = mapRunToCatwalk(status);

      // Architecture station should be absent and skipped
      expect(config.stations[0]?.absent).toBe(true);
      expect(config.stations[0]?.skipped).toBe(true);

      // Gate at index 0 (between stations 0 and 1) should be open because station 0 is absent
      expect(config.gates[0]?.open).toBe(true);
      expect(config.gates[0]?.betweenStations).toEqual([0, 1]);
    });
  });

  describe('multiple reviewers', () => {
    it('produces reviewer agents with sequential IDs and slot indices', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: undefined,
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
              'security-reviewer': {
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

      const config = mapRunToCatwalk(status);

      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents).toHaveLength(2);
      expect(reviewerAgents[0]?.id).toBe('reviewer-0');
      expect(reviewerAgents[0]?.slotIndex).toBe(0);
      expect(reviewerAgents[1]?.id).toBe('reviewer-1');
      expect(reviewerAgents[1]?.slotIndex).toBe(1);
    });
  });
});

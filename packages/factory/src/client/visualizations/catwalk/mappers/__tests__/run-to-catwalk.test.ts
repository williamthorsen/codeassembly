import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import { PALETTE } from '../../../../../shared/constants/palette.js';
import { mapRunToCatwalk } from '../run-to-catwalk.js';

describe('mapRunToCatwalk', () => {
  describe('empty in_progress run', () => {
    it('infers architecture as current phase, with arch agent working, orchestrator working, and all others idle', () => {
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

      // Orchestrator at station 0, working (architecture is inferred current, no data yet)
      expect(config.orchestrator.stationIndex).toBe(0);
      expect(config.orchestrator.working).toBe(true);

      // All 6 gates closed (no phases evaluated)
      expect(config.gates).toHaveLength(6);
      for (const gate of config.gates) {
        expect(gate.open).toBe(false);
      }

      // No artifacts
      expect(config.artifacts).toHaveLength(0);
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

      // Orchestrator at station 3 (review), not working (review data is present)
      expect(config.orchestrator.stationIndex).toBe(3);
      expect(config.orchestrator.working).toBe(false);

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
    it('shows all agents as concerned and orchestrator at sentinel stationIndex -1', () => {
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

      // Orchestrator uses sentinel stationIndex -1 for failed runs
      expect(config.orchestrator.stationIndex).toBe(-1);
    });
  });

  describe('needs_manual_review run', () => {
    it('uses per-phase logic, not all-concerned, with orchestrator stationIndex -1', () => {
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
      });

      const config = mapRunToCatwalk(status);

      // Per-phase logic: completed phases produce 'resting', not 'concerned'
      const archAgent = config.agents.find((a) => a.id === 'arch');
      expect(archAgent?.state).toBe('resting');

      const planAgent = config.agents.find((a) => a.id === 'plan');
      expect(planAgent?.state).toBe('resting');

      const coderAgent = config.agents.find((a) => a.id === 'coder');
      expect(coderAgent?.state).toBe('resting');

      // Orchestrator stationIndex is -1 (falls to else branch, not in_progress)
      expect(config.orchestrator.stationIndex).toBe(-1);
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
    it('produces reviewer agents with sequential IDs and slot indices from Shape 1 (flat reviewers)', () => {
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

    it('extracts reviewer names from Shape 2 (iterations[].perReviewer)', () => {
      // perReviewer is an untyped extra property that passes through Zod .loose().
      // Use Object.assign to add it without a type assertion.
      const iterationWithPerReviewer = Object.assign(
        { reviewers: [] },
        { perReviewer: { 'alpha-reviewer': {}, 'beta-reviewer': {} } },
      );
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
            coderFixCycleRan: false,
            selectiveReReview: undefined,
            iterations: [iterationWithPerReviewer],
          },
        },
      });

      const config = mapRunToCatwalk(status);

      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents).toHaveLength(2);
      expect(reviewerAgents[0]?.role).toBe('alpha-reviewer');
      expect(reviewerAgents[1]?.role).toBe('beta-reviewer');
    });

    it('extracts reviewer names from Shape 2 string-array reviewers (iterations[].reviewers)', () => {
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
            coderFixCycleRan: false,
            selectiveReReview: undefined,
            iterations: [{ reviewers: ['name-a', 'name-b'] }],
          },
        },
      });

      const config = mapRunToCatwalk(status);

      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents).toHaveLength(2);
      expect(reviewerAgents[0]?.role).toBe('name-a');
      expect(reviewerAgents[1]?.role).toBe('name-b');
    });

    it('extracts reviewer names from Shape 3 (top-level reviewerDetails)', () => {
      // reviewerDetails is an untyped extra property that passes through Zod .loose().
      // Use Object.assign to add it without a type assertion.
      const parallelReviewWithDetails = Object.assign(
        {
          aggregatedCriticality: undefined,
          reviewRoundsUsed: 1,
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
        { reviewerDetails: { 'gamma-reviewer': {}, 'delta-reviewer': {}, 'epsilon-reviewer': {} } },
      );
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: parallelReviewWithDetails,
        },
      });

      const config = mapRunToCatwalk(status);

      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents).toHaveLength(3);
      expect(reviewerAgents[0]?.role).toBe('gamma-reviewer');
      expect(reviewerAgents[1]?.role).toBe('delta-reviewer');
      expect(reviewerAgents[2]?.role).toBe('epsilon-reviewer');
    });
  });

  describe('reviewer fallback when review is not current phase', () => {
    it('produces a single fallback reviewer-0 when parallelReview is absent and current phase is implementation', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
      });

      const config = mapRunToCatwalk(status);

      const reviewerAgents = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewerAgents).toHaveLength(1);
      expect(reviewerAgents[0]?.id).toBe('reviewer-0');
      expect(reviewerAgents[0]?.state).toBe('idle');
    });
  });

  describe('artifact mapping', () => {
    it('maps artifacts to StationArtifactConfig with correct stationIndex, label, color, and slot', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
        artifacts: [
          {
            filename: 'arch-assessment.md',
            role: 'analyst',
            roleType: 'analyst',
            agent: 'orchestrated-architect',
            type: 'architecture',
            phase: 'architecture',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
          {
            filename: 'change-summary.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
            iteration: 2,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.artifacts).toHaveLength(3);

      // Architecture artifact at station 0
      expect(config.artifacts[0]?.stationIndex).toBe(0);
      expect(config.artifacts[0]?.label).toBe('architecture');
      expect(config.artifacts[0]?.color).toBe(PALETTE.blue);
      expect(config.artifacts[0]?.slot).toBe('output');

      // Planning artifact at station 1
      expect(config.artifacts[1]?.stationIndex).toBe(1);
      expect(config.artifacts[1]?.label).toBe('plan');
      expect(config.artifacts[1]?.color).toBe(PALETTE.green);
      expect(config.artifacts[1]?.slot).toBe('output');

      // Code artifact at station 2 with version from iteration
      expect(config.artifacts[2]?.stationIndex).toBe(2);
      expect(config.artifacts[2]?.label).toBe('code');
      expect(config.artifacts[2]?.color).toBe(PALETTE.yellow);
      expect(config.artifacts[2]?.slot).toBe('output');
      expect(config.artifacts[2]?.version).toBe(2);
    });

    it('uses fallback color for unrecognized artifact type', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'mystery.md',
            role: 'analyst',
            roleType: 'analyst',
            agent: 'unknown-agent',
            type: 'unknown-type',
            phase: 'architecture',
            createdAt: '2026-01-01T00:10:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]?.color).toBe(PALETTE.cyan);
    });

    it('skips artifacts with unknown phase', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'arch.md',
            role: 'analyst',
            roleType: 'analyst',
            agent: 'orchestrated-architect',
            type: 'architecture',
            phase: 'architecture',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'unknown.md',
            role: 'unknown',
            roleType: 'unknown',
            agent: 'unknown-agent',
            type: 'mystery',
            phase: 'nonexistent-phase',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Only the architecture artifact should be present; the unknown phase is skipped
      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]?.stationIndex).toBe(0);
    });

    it('omits version when iteration is not present on artifact', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:10:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]).not.toHaveProperty('version');
    });
  });
});

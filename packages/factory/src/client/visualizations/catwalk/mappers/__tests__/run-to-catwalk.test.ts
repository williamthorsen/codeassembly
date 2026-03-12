import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import { ARTIFACT_COLORS } from '../../../../../shared/constants/artifact-colors.js';
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

  describe('carried artifacts', () => {
    it('populates carriedArtifacts when orchestrator is working (delivering to current phase)', () => {
      // Architecture completed, planning not yet started -> orchestrator at planning (working)
      // Should carry architecture artifacts
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
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
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator at station 1 (planning), working = true
      expect(config.orchestrator.stationIndex).toBe(1);
      expect(config.orchestrator.working).toBe(true);
      expect(config.orchestrator.carriedArtifacts).toHaveLength(1);
      expect(config.orchestrator.carriedArtifacts[0]?.label).toBe('architecture');
    });

    it('sets carriedArtifacts to empty when orchestrator is idle (phase agent is active)', () => {
      // Architecture completed, planning in progress (data present)
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
        },
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
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator at station 1 (planning), working = false (data is present)
      expect(config.orchestrator.working).toBe(false);
      expect(config.orchestrator.carriedArtifacts).toHaveLength(0);
    });

    it('sets carriedArtifacts to empty when orchestrator is at station 0', () => {
      // No previous station to carry from
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.stationIndex).toBe(0);
      expect(config.orchestrator.carriedArtifacts).toHaveLength(0);
    });
  });

  describe('code badge', () => {
    it('shows v2 badge when max implementation artifact iteration is 2', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
            iteration: 1,
          },
          {
            filename: 'code-v2.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:20:00Z',
            iteration: 2,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge).not.toBeNull();
      expect(config.orchestrator.codeBadge?.label).toBe('v2');
      expect(config.orchestrator.codeBadge?.color).toBe('#ffaa00');
    });

    it('shows v3 badge with warning color when max iteration is 3+', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'code-v3.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
            iteration: 3,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge?.label).toBe('v3');
      expect(config.orchestrator.codeBadge?.color).toBe('#ff6600');
    });

    it('returns null codeBadge when no iteration data', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'code.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge).toBeNull();
    });

    it('returns null codeBadge when max iteration is 1', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'code.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
            iteration: 1,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge).toBeNull();
    });

    it('returns null codeBadge when no artifacts at all', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge).toBeNull();
    });

    it('ignores non-implementation artifacts when computing badge', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'orchestrated-reviewer',
            type: 'review',
            phase: 'review',
            createdAt: '2026-01-01T00:10:00Z',
            iteration: 3,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.codeBadge).toBeNull();
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

      // Filter output artifacts (input artifacts are generated from outputs)
      const outputs = config.artifacts.filter((a) => a.slot === 'output');
      expect(outputs).toHaveLength(3);

      // Architecture artifact at station 0
      expect(outputs[0]?.stationIndex).toBe(0);
      expect(outputs[0]?.label).toBe('architecture');
      expect(outputs[0]?.color).toBe(ARTIFACT_COLORS.arch);
      expect(outputs[0]?.slot).toBe('output');
      expect(outputs[0]?.agentSlotIndex).toBe(0);

      // Planning artifact at station 1
      expect(outputs[1]?.stationIndex).toBe(1);
      expect(outputs[1]?.label).toBe('plan');
      expect(outputs[1]?.color).toBe(ARTIFACT_COLORS.plan);
      expect(outputs[1]?.slot).toBe('output');

      // Code artifact at station 2 with version from iteration
      expect(outputs[2]?.stationIndex).toBe(2);
      expect(outputs[2]?.label).toBe('code');
      expect(outputs[2]?.color).toBe(ARTIFACT_COLORS.code);
      expect(outputs[2]?.slot).toBe('output');
      expect(outputs[2]?.version).toBe(2);

      // Input artifacts are also present (derived from outputs)
      const inputs = config.artifacts.filter((a) => a.slot === 'input');
      expect(inputs.length).toBeGreaterThan(0);
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

      const outputs = config.artifacts.filter((a) => a.slot === 'output');
      expect(outputs).toHaveLength(1);
      expect(outputs[0]?.color).toBe(ARTIFACT_COLORS.code);
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

      // Only the architecture output artifact should be present; the unknown phase is skipped
      const outputs = config.artifacts.filter((a) => a.slot === 'output');
      expect(outputs).toHaveLength(1);
      expect(outputs[0]?.stationIndex).toBe(0);
    });

    it('maps artifacts with iteration to version on StationArtifactConfig', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        artifacts: [
          {
            filename: 'code.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
            iteration: 2,
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      const outputs = config.artifacts.filter((a) => a.slot === 'output');
      expect(outputs).toHaveLength(1);
      expect(outputs[0]?.version).toBe(2);
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

      const outputs = config.artifacts.filter((a) => a.slot === 'output');
      expect(outputs).toHaveLength(1);
      expect(outputs[0]).not.toHaveProperty('version');
    });
  });

  describe('celebrating flag', () => {
    it('sets celebrating to true on completed run', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.celebrating).toBe(true);
    });

    it('sets celebrating to false on in_progress run', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToCatwalk(status);

      expect(config.orchestrator.celebrating).toBe(false);
    });
  });

  describe('input artifacts', () => {
    it('generates input artifacts at downstream stations from output artifacts', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
        },
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
        ],
      });

      const config = mapRunToCatwalk(status);

      // Output at station 0, input at station 1
      const inputs = config.artifacts.filter((a) => a.slot === 'input');
      expect(inputs.length).toBeGreaterThanOrEqual(1);
      const station1Input = inputs.find((a) => a.stationIndex === 1);
      expect(station1Input).toBeDefined();
      expect(station1Input?.label).toBe('architecture');
    });

    it('routes coder change-summaries to implementation station even when phase is review', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code-v1.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'code-fix.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'review',
            iteration: 1,
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Both change-summaries should be outputs at station 2 (implementation), not station 3 (review)
      const implOutputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'output');
      expect(implOutputs).toHaveLength(2);
      const reviewOutputs = config.artifacts.filter((a) => a.stationIndex === 3 && a.slot === 'output');
      expect(reviewOutputs).toHaveLength(0);
    });

    it('excludes all fix-cycle artifacts from downstream input cascade', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code-v1.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'code-fix1.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            iteration: 1,
            createdAt: '2026-01-01T00:20:00Z',
          },
          {
            filename: 'code-fix2.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            iteration: 2,
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // All three should be outputs at station 2
      const implOutputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'output');
      expect(implOutputs).toHaveLength(3);

      // Only the original (no iteration) should cascade as input to station 3
      const reviewInputs = config.artifacts.filter((a) => a.stationIndex === 3 && a.slot === 'input');
      expect(reviewInputs).toHaveLength(1);
      expect(reviewInputs[0]?.label).toBe('code');
    });

    it('collects all run deliverables at the summary station when completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
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
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Summary station (6) should have input artifacts from all upstream stations
      const summaryInputs = config.artifacts.filter((a) => a.stationIndex === 6 && a.slot === 'input');
      expect(summaryInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('correctly lays out a completed run with 2 fix cycles (realistic scenario)', () => {
      // Models the actual run for ticket #239: architecture/planning absent,
      // implementation + 2 review rounds with 3 parallel reviewers + holistic review.
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:30:00Z',
        phases: {
          ...emptyPhases(),
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 2,
            reviewers: {
              'orchestrated-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'aspect-test-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'aspect-code-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: true,
            selectiveReReview: undefined,
            iterations: [
              {
                reviewers: ['orchestrated-reviewer', 'aspect-test-reviewer', 'aspect-code-reviewer'],
                dispatchedAt: '2026-01-01T00:30:00Z',
              },
              {
                reviewers: ['orchestrated-reviewer', 'aspect-test-reviewer', 'aspect-code-reviewer'],
                dispatchedAt: '2026-01-01T01:00:00Z',
              },
            ],
          },
          holisticReview: {
            status: 'completed',
            criticality: 'low',
            reReviewCriticality: undefined,
            coderFixCycleRan: false,
            reviewRoundsUsed: 1,
            artifact: undefined,
          },
        },
        artifacts: [
          // Implementation change-summary (original, no iteration)
          {
            filename: '03_coder_change-summary.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'implementation',
            createdAt: '2026-01-01T00:10:00Z',
          },
          // Review round 1: 3 reviewers
          {
            filename: '04_reviewer_review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'orchestrated-reviewer',
            type: 'review',
            phase: 'review',
            iteration: 1,
            createdAt: '2026-01-01T00:35:00Z',
          },
          {
            filename: '06_test-reviewer_test-review.md',
            role: 'test-reviewer',
            roleType: 'reviewer',
            agent: 'aspect-test-reviewer',
            type: 'test-review',
            phase: 'review',
            iteration: 1,
            createdAt: '2026-01-01T00:35:01Z',
          },
          {
            filename: '07_code-reviewer_code-review.md',
            role: 'code-reviewer',
            roleType: 'reviewer',
            agent: 'aspect-code-reviewer',
            type: 'code-review',
            phase: 'review',
            iteration: 1,
            createdAt: '2026-01-01T00:35:02Z',
          },
          // Fix cycle 1: coder change-summary (phase: review, iteration: 1)
          {
            filename: '08_coder_change-summary.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'review',
            iteration: 1,
            createdAt: '2026-01-01T00:50:00Z',
          },
          // Review round 2: 3 reviewers
          {
            filename: '09_reviewer_review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'orchestrated-reviewer',
            type: 'review',
            phase: 'review',
            iteration: 2,
            createdAt: '2026-01-01T01:05:00Z',
          },
          {
            filename: '10_test-reviewer_test-review.md',
            role: 'test-reviewer',
            roleType: 'reviewer',
            agent: 'aspect-test-reviewer',
            type: 'test-review',
            phase: 'review',
            iteration: 2,
            createdAt: '2026-01-01T01:05:01Z',
          },
          {
            filename: '11_code-reviewer_code-review.md',
            role: 'code-reviewer',
            roleType: 'reviewer',
            agent: 'aspect-code-reviewer',
            type: 'code-review',
            phase: 'review',
            iteration: 2,
            createdAt: '2026-01-01T01:05:02Z',
          },
          // Fix cycle 2: coder change-summary (phase: review, iteration: 2)
          {
            filename: '12_coder_change-summary.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'review',
            iteration: 2,
            createdAt: '2026-01-01T01:10:00Z',
          },
          // Holistic review
          {
            filename: '14_reviewer_holistic-review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'orchestrated-reviewer',
            type: 'holistic-review',
            phase: 'holistic',
            createdAt: '2026-01-01T01:20:00Z',
          },
          // Summary
          {
            filename: '15_orchestrator_run-summary.md',
            role: 'orchestrator',
            roleType: 'orchestrator',
            agent: 'orchestrator',
            type: 'run-summary',
            phase: 'summary',
            createdAt: '2026-01-01T01:25:00Z',
          },
          {
            filename: '16_analyst_savings-analysis.md',
            role: 'analyst',
            roleType: 'analyst',
            agent: 'savings-analyzer',
            type: 'savings-analysis',
            phase: 'summary',
            createdAt: '2026-01-01T01:25:01Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // --- Station 2 (coder): all change-summaries are outputs, no inputs ---
      const station2Outputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'output');
      const station2Inputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'input');
      expect(station2Outputs).toHaveLength(3);
      expect(station2Outputs.every((a) => a.label === 'change-summary')).toBe(true);
      expect(station2Inputs).toHaveLength(0);

      // --- Station 3 (reviewer): 6 review outputs, 1 change-summary input ---
      const station3Outputs = config.artifacts.filter((a) => a.stationIndex === 3 && a.slot === 'output');
      const station3Inputs = config.artifacts.filter((a) => a.stationIndex === 3 && a.slot === 'input');
      expect(station3Outputs).toHaveLength(6);
      expect(station3Inputs).toHaveLength(1);
      expect(station3Inputs[0]?.label).toBe('change-summary');

      // --- Station 4 (simplifier): no artifacts at all ---
      const station4All = config.artifacts.filter((a) => a.stationIndex === 4);
      expect(station4All).toHaveLength(0);

      // --- Station 5 (holistic): 1 output, no inputs ---
      const station5Outputs = config.artifacts.filter((a) => a.stationIndex === 5 && a.slot === 'output');
      const station5Inputs = config.artifacts.filter((a) => a.stationIndex === 5 && a.slot === 'input');
      expect(station5Outputs).toHaveLength(1);
      expect(station5Outputs[0]?.label).toBe('holistic-review');
      expect(station5Inputs).toHaveLength(0);

      // --- Station 6 (orchestrator/summary): 2 outputs, 10 summary inputs ---
      const station6Outputs = config.artifacts.filter((a) => a.stationIndex === 6 && a.slot === 'output');
      const station6Inputs = config.artifacts.filter((a) => a.stationIndex === 6 && a.slot === 'input');
      expect(station6Outputs).toHaveLength(2);
      expect(station6Inputs).toHaveLength(10);

      // --- Total artifact count ---
      expect(config.artifacts).toHaveLength(23);
    });
  });

  describe('buildCarriedArtifacts boundary cases', () => {
    it('carries review artifact when orchestrator is at the holistic review station (index 5)', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
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
          codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
        },
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
            filename: 'review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'correctness-reviewer',
            type: 'review',
            phase: 'parallelReview',
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator should be at station 5 (holistic), working
      expect(config.orchestrator.stationIndex).toBe(5);
      expect(config.orchestrator.working).toBe(true);
      // Should carry the review artifact from station 3 (reverse scan from 4 finds nothing, then from 3)
      expect(config.orchestrator.carriedArtifacts.length).toBeGreaterThanOrEqual(1);
      expect(config.orchestrator.carriedArtifacts[0]?.label).toBe('review');
    });

    it('carries implementation artifact when orchestrator is at the review station (fix-shuttle)', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code.md',
            role: 'author',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator should be at station 3 (review), working
      expect(config.orchestrator.stationIndex).toBe(3);
      expect(config.orchestrator.working).toBe(true);
      // Should carry the implementation artifact from station 2
      expect(config.orchestrator.carriedArtifacts).toHaveLength(1);
      expect(config.orchestrator.carriedArtifacts[0]?.label).toBe('code');
    });
  });

  describe('deferred input derivation', () => {
    it('does not derive inputs at stations beyond the orchestrator position', () => {
      // Architecture completed, planning in progress (orchestrator at station 1).
      // Architecture output exists at station 0, but we should not see inputs at
      // station 2 because the orchestrator is only at station 1.
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
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
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator at station 1 (planning is the current inferred phase)
      expect(config.orchestrator.stationIndex).toBe(1);

      // Input at station 1 should exist (orchestrator has reached it)
      const station1Inputs = config.artifacts.filter((a) => a.stationIndex === 1 && a.slot === 'input');
      expect(station1Inputs).toHaveLength(1);

      // Input at station 2 should NOT exist (orchestrator has not reached it)
      const station2Inputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'input');
      expect(station2Inputs).toHaveLength(0);
    });

    it('derives all inputs for a completed run regardless of station index', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
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
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Completed run: all inputs should be present
      const station1Inputs = config.artifacts.filter((a) => a.stationIndex === 1 && a.slot === 'input');
      expect(station1Inputs).toHaveLength(1);

      const station2Inputs = config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'input');
      expect(station2Inputs).toHaveLength(1);

      // Summary inputs should also be present
      const summaryInputs = config.artifacts.filter((a) => a.stationIndex === 6 && a.slot === 'input');
      expect(summaryInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('inputs appear at the orchestrator station but not beyond', () => {
      // Orchestrator at station 3 (review phase, working).
      // Arch output at 0, plan output at 1, code output at 2.
      // Inputs should exist at 1, 2, 3 but not beyond.
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
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
            filename: 'plan.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'orchestrated-planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
          {
            filename: 'code.md',
            role: 'coder',
            roleType: 'author',
            agent: 'orchestrated-coder',
            type: 'change-summary',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const config = mapRunToCatwalk(status);

      // Orchestrator at station 3 (review, working)
      expect(config.orchestrator.stationIndex).toBe(3);

      // Inputs at stations 1, 2, 3 should exist
      expect(config.artifacts.filter((a) => a.stationIndex === 1 && a.slot === 'input')).toHaveLength(1);
      expect(config.artifacts.filter((a) => a.stationIndex === 2 && a.slot === 'input')).toHaveLength(1);
      expect(config.artifacts.filter((a) => a.stationIndex === 3 && a.slot === 'input')).toHaveLength(1);

      // No inputs at stations 4, 5 (orchestrator has not reached them)
      expect(config.artifacts.filter((a) => a.stationIndex === 4 && a.slot === 'input')).toHaveLength(0);
      expect(config.artifacts.filter((a) => a.stationIndex === 5 && a.slot === 'input')).toHaveLength(0);
    });
  });
});

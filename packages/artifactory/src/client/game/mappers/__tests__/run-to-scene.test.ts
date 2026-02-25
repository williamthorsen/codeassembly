import { describe, expect, it } from 'vitest';

import type { CanonicalRunStatus, Phases } from '../../../../shared/types/canonical.js';
import { createSceneConfig } from '../run-to-scene.js';

function emptyPhases(): Phases {
  return {
    architecture: undefined,
    planning: undefined,
    implementation: undefined,
    parallelReview: undefined,
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}

function createBaseStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'in_progress',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    fixLowFindings: undefined,
    phases: emptyPhases(),
    phaseDecision: {},
    ...overrides,
  };
}

function createCompletedRunPhases(): Phases {
  return {
    architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
    implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    parallelReview: {
      aggregatedCriticality: 'low',
      reviewRoundsUsed: 1,
      reviewers: {},
      coderFixCycleRan: false,
      selectiveReReview: undefined,
    },
    review: undefined,
    codeSimplifier: undefined,
    holisticReview: undefined,
  };
}

describe('createSceneConfig', () => {
  describe('station activation', () => {
    it('marks active phases as active stations', () => {
      const status = createBaseStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.stations[0]?.active).toBe(true);
      expect(config.stations[1]?.active).toBe(true);
      expect(config.stations[2]?.active).toBe(true);
      expect(config.stations[3]?.active).toBe(true);
    });

    it('marks skipped phases as inactive stations', () => {
      const status = createBaseStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.stations[4]?.active).toBe(false);
      expect(config.stations[5]?.active).toBe(false);
    });

    it('marks summary station active when run is completed', () => {
      const status = createBaseStatus({ status: 'completed', completedAt: '2026-01-01T01:00:00Z' });

      const config = createSceneConfig(status);

      expect(config.stations[6]?.active).toBe(true);
    });
  });

  describe('agents', () => {
    it('creates agents for active phases with correct station indices', () => {
      const status = createBaseStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.agents).toHaveLength(4);
      expect(config.agents[0]).toEqual({ role: 'architect', stationIndex: 0 });
      expect(config.agents[1]).toEqual({ role: 'planner', stationIndex: 1 });
      expect(config.agents[2]).toEqual({ role: 'coder', stationIndex: 2 });
      expect(config.agents[3]).toEqual({ role: 'reviewer', stationIndex: 3 });
    });
  });

  describe('artifacts', () => {
    it('creates artifacts for phases that produced them', () => {
      const status = createBaseStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(3);
      expect(config.artifacts[0]?.type).toBe('architecture');
      expect(config.artifacts[1]?.type).toBe('plan');
      expect(config.artifacts[2]?.type).toBe('code');
    });
  });

  describe('gates', () => {
    it('opens gates between consecutive active stations', () => {
      const status = createBaseStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.gates[0]?.open).toBe(true);
      expect(config.gates[1]?.open).toBe(true);
      expect(config.gates[2]?.open).toBe(true);
    });
  });

  it('maps legacy format with review phase', () => {
    const status = createBaseStatus({
      status: 'completed',
      completedAt: '2026-01-01T01:00:00Z',
      phases: {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'medium', artifact: undefined },
        planning: { status: 'completed', stepCount: 8, artifacts: undefined },
        implementation: { status: 'completed', artifact: undefined, qualityGates: 'all passing' },
        review: { status: 'approved', iterations: 2, finalCriticality: 'low' },
      },
    });

    const config = createSceneConfig(status);

    expect(config.stations[3]?.active).toBe(true);
    expect(config.agents.find((a) => a.role === 'reviewer')).toBeDefined();
  });

  it('handles all phases skipped', () => {
    const status = createBaseStatus();

    const config = createSceneConfig(status);

    expect(config.stations.every((s) => !s.active)).toBe(true);
    expect(config.agents).toHaveLength(0);
    expect(config.artifacts).toHaveLength(0);
    expect(config.gates.every((g) => !g.open)).toBe(true);
  });

  it('always generates 7 stations and 6 gates', () => {
    const status = createBaseStatus();

    const config = createSceneConfig(status);

    expect(config.stations).toHaveLength(7);
    expect(config.gates).toHaveLength(6);
  });
});

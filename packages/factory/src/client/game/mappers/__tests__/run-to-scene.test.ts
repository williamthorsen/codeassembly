import { describe, expect, it } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus, emptyPhases } from '../../../../__test-helpers__/fixtures.js';
import { createSceneConfig, PHASE_NAMES } from '../run-to-scene.js';

describe('createSceneConfig', () => {
  describe('station activation', () => {
    it('marks active phases as active stations', () => {
      const status = createMockRunStatus({
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
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.stations[4]?.active).toBe(false);
      expect(config.stations[5]?.active).toBe(false);
    });

    it('marks summary station active when run is completed', () => {
      const status = createMockRunStatus({ status: 'completed', completedAt: '2026-01-01T01:00:00Z' });

      const config = createSceneConfig(status);

      expect(config.stations[6]?.active).toBe(true);
    });
  });

  describe('agents', () => {
    it('creates agents for active phases with correct station indices', () => {
      const status = createMockRunStatus({
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

    it('assigns stationIndex values matching PHASE_NAMES ordering', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      const architectIndex = PHASE_NAMES.indexOf('architecture');
      const planningIndex = PHASE_NAMES.indexOf('planning');
      const implementationIndex = PHASE_NAMES.indexOf('implementation');
      const reviewIndex = PHASE_NAMES.indexOf('review');

      expect(config.agents.find((a) => a.role === 'architect')?.stationIndex).toBe(architectIndex);
      expect(config.agents.find((a) => a.role === 'planner')?.stationIndex).toBe(planningIndex);
      expect(config.agents.find((a) => a.role === 'coder')?.stationIndex).toBe(implementationIndex);
      expect(config.agents.find((a) => a.role === 'reviewer')?.stationIndex).toBe(reviewIndex);
    });
  });

  describe('artifacts', () => {
    it('creates artifacts for phases that produced them', () => {
      const status = createMockRunStatus({
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
      const status = createMockRunStatus({
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
    const status = createMockRunStatus({
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
    const status = createMockRunStatus();

    const config = createSceneConfig(status);

    expect(config.stations.every((s) => !s.active)).toBe(true);
    expect(config.agents).toHaveLength(0);
    expect(config.artifacts).toHaveLength(0);
    expect(config.gates.every((g) => !g.open)).toBe(true);
  });

  it('always generates 7 stations and 6 gates', () => {
    const status = createMockRunStatus();

    const config = createSceneConfig(status);

    expect(config.stations).toHaveLength(7);
    expect(config.gates).toHaveLength(6);
  });

  describe('station phase names match PHASE_NAMES ordering', () => {
    it('assigns station phases in PHASE_NAMES order', () => {
      const status = createMockRunStatus();

      const config = createSceneConfig(status);

      config.stations.forEach((station, i) => {
        expect(station.phase).toBe(PHASE_NAMES[i]);
      });
    });
  });

  describe('codeSimplifier activation', () => {
    it('marks simplifier station active when codeSimplifier.ran is true', () => {
      const simplifierIndex = PHASE_NAMES.indexOf('simplifier');
      const status = createMockRunStatus({
        phases: {
          ...emptyPhases(),
          codeSimplifier: { ran: true, actionableFindings: true, coderFixCycleRan: false, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);

      expect(config.stations[simplifierIndex]?.active).toBe(true);
    });

    it('marks simplifier station inactive when codeSimplifier.ran is false', () => {
      const simplifierIndex = PHASE_NAMES.indexOf('simplifier');
      const status = createMockRunStatus({
        phases: {
          ...emptyPhases(),
          codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);

      expect(config.stations[simplifierIndex]?.active).toBe(false);
    });

    it('marks simplifier station inactive when codeSimplifier is undefined', () => {
      const simplifierIndex = PHASE_NAMES.indexOf('simplifier');
      const status = createMockRunStatus({
        phases: {
          ...emptyPhases(),
          codeSimplifier: undefined,
        },
      });

      const config = createSceneConfig(status);

      expect(config.stations[simplifierIndex]?.active).toBe(false);
    });
  });
});

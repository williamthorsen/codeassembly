import { describe, expect, it } from 'vitest';

import { createCompletedRunPhases, createMockRunStatus, emptyPhases } from '../../../../__test-helpers__/fixtures.js';
import { PHASE_ROLE_TYPE } from '../../../../shared/constants/role-types.js';
import { REVIEW_STATION_INDEX as LAYOUT_REVIEW_STATION_INDEX } from '../../layout/platform-layout.js';
import { createSceneConfig, PHASE_NAMES, REVIEW_STATION_INDEX } from '../run-to-scene.js';

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

    it('marks simplifier station active when codeSimplifier.ran is true', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);
      const simplifierIndex = PHASE_NAMES.indexOf('simplifier');

      expect(config.stations[simplifierIndex]?.active).toBe(true);
    });

    it('marks holistic station active when holisticReview exists', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);
      const holisticIndex = PHASE_NAMES.indexOf('holistic');

      expect(config.stations[holisticIndex]?.active).toBe(true);
    });

    it('marks skipped phases as inactive stations', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const config = createSceneConfig(status);

      expect(config.stations[1]?.active).toBe(false);
      expect(config.stations[2]?.active).toBe(false);
    });

    it('marks summary station active when run is completed', () => {
      const status = createMockRunStatus({ status: 'completed', completedAt: '2026-01-01T01:00:00Z' });

      const config = createSceneConfig(status);

      expect(config.stations[6]?.active).toBe(true);
    });
  });

  describe('agents', () => {
    it('creates agents for all 7 phases when run is completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      // 1 architect + 1 planner + 1 coder + 2 reviewers + 1 simplifier + 1 holistic + 1 orchestrator = 8
      expect(config.agents).toHaveLength(8);
    });

    it('assigns correct roleType to each agent', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.agents[0]).toEqual({
        role: 'architect',
        roleType: PHASE_ROLE_TYPE.architecture,
        stationIndex: 0,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[1]).toEqual({
        role: 'planner',
        roleType: PHASE_ROLE_TYPE.planning,
        stationIndex: 1,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[2]).toEqual({
        role: 'coder',
        roleType: PHASE_ROLE_TYPE.implementation,
        stationIndex: 2,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[3]).toEqual({
        role: 'correctness-reviewer',
        roleType: PHASE_ROLE_TYPE.review,
        stationIndex: 3,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[4]).toEqual({
        role: 'security-reviewer',
        roleType: PHASE_ROLE_TYPE.review,
        stationIndex: 3,
        stackOffset: 1,
        level: 1,
      });
      expect(config.agents[5]).toEqual({
        role: 'simplifier',
        roleType: PHASE_ROLE_TYPE.simplifier,
        stationIndex: 4,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[6]).toEqual({
        role: 'holistic-reviewer',
        roleType: PHASE_ROLE_TYPE.holistic,
        stationIndex: 5,
        stackOffset: 0,
        level: 0,
      });
      expect(config.agents[7]).toEqual({
        role: 'orchestrator',
        roleType: PHASE_ROLE_TYPE.summary,
        stationIndex: 6,
        stackOffset: 0,
        level: 0,
      });
    });

    it('creates one agent per parallel reviewer with sequential stackOffset', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      const reviewerAgents = config.agents.filter((a) => a.stationIndex === 3);
      expect(reviewerAgents).toHaveLength(2);
      expect(reviewerAgents[0]?.stackOffset).toBe(0);
      expect(reviewerAgents[1]?.stackOffset).toBe(1);
    });

    it('creates single generic reviewer when reviewers map is empty', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {},
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
        },
      });

      const config = createSceneConfig(status);

      const reviewerAgents = config.agents.filter((a) => a.roleType === 'reviewer');
      expect(reviewerAgents).toHaveLength(1);
      expect(reviewerAgents[0]).toEqual({
        role: 'reviewer',
        roleType: 'reviewer',
        stationIndex: 3,
        stackOffset: 0,
        level: 0,
      });
    });

    it('creates single reviewer for legacy review format', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          review: { status: 'approved', iterations: 2, finalCriticality: 'low' },
        },
      });

      const config = createSceneConfig(status);

      const reviewerAgents = config.agents.filter((a) => a.stationIndex === 3);
      expect(reviewerAgents).toHaveLength(1);
      expect(reviewerAgents[0]).toEqual({
        role: 'reviewer',
        roleType: 'reviewer',
        stationIndex: 3,
        stackOffset: 0,
        level: 0,
      });
    });

    it('assigns sequential stackOffset for 3+ parallel reviewers', () => {
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
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'performance-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
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

      const config = createSceneConfig(status);

      const reviewerAgents = config.agents.filter((a) => a.roleType === 'reviewer');
      expect(reviewerAgents).toHaveLength(3);
      expect(reviewerAgents[0]?.stackOffset).toBe(0);
      expect(reviewerAgents[1]?.stackOffset).toBe(1);
      expect(reviewerAgents[2]?.stackOffset).toBe(2);
    });

    it('does not create simplifier agent when codeSimplifier is undefined', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          codeSimplifier: undefined,
        },
      });

      const config = createSceneConfig(status);

      const simplifierAgents = config.agents.filter((a) => a.stationIndex === 4);
      expect(simplifierAgents).toHaveLength(0);
    });

    it('does not create simplifier agent when codeSimplifier.ran is false', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);

      const simplifierAgents = config.agents.filter((a) => a.stationIndex === 4);
      expect(simplifierAgents).toHaveLength(0);
    });

    it('assigns level 0 to first parallel reviewer and level 1 to second', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);
      const reviewerAgents = config.agents.filter((a) => a.stationIndex === 3);

      expect(reviewerAgents[0]?.level).toBe(0);
      expect(reviewerAgents[1]?.level).toBe(1);
    });

    it('assigns levels 0, 1, 2 for 3 parallel reviewers', () => {
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
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'performance-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
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

      const config = createSceneConfig(status);
      const reviewerAgents = config.agents.filter((a) => a.stationIndex === 3);

      expect(reviewerAgents[0]?.level).toBe(0);
      expect(reviewerAgents[1]?.level).toBe(1);
      expect(reviewerAgents[2]?.level).toBe(2);
    });

    it('assigns level 0 to all non-reviewer agents', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);
      const nonReviewerAgents = config.agents.filter((a) => a.stationIndex !== 3);

      for (const agent of nonReviewerAgents) {
        expect(agent.level).toBe(0);
      }
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
      expect(config.agents.find((a) => a.role === 'correctness-reviewer')?.stationIndex).toBe(reviewIndex);
    });
  });

  describe('orchestrator positioning', () => {
    it('places orchestrator at architecture station when only architecture is active', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(0);
      expect(orchestrator?.level).toBe(0);
    });

    it('places orchestrator at review station when review is active', () => {
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

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(3);
      // Orchestrator should have stackOffset 1 to avoid overlapping the reviewer at stackOffset 0
      expect(orchestrator?.stackOffset).toBe(1);
    });

    it('does not create orchestrator when no phases are active', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeUndefined();
    });

    it('does not create orchestrator on failed runs', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeUndefined();
    });

    it('places orchestrator at summary station when run is completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(6);
      expect(orchestrator?.stackOffset).toBe(0);
      expect(orchestrator?.level).toBe(0);
    });

    it('sets orchestrator stackOffset to avoid overlap with existing agents', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');
      const architect = config.agents.find((a) => a.role === 'architect');

      expect(architect?.stationIndex).toBe(0);
      expect(orchestrator?.stationIndex).toBe(0);
      expect(orchestrator?.stackOffset).toBe(1);
    });

    it('places orchestrator at highest reviewer level when review has 2 reviewers', () => {
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
              'security-reviewer': {
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

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(1);
    });

    it('places orchestrator at highest reviewer level when review has 3 reviewers', () => {
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
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'performance-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
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

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(2);
    });

    it('places orchestrator at level 0 when parallelReview has 0 reviewers', () => {
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
            reviewers: {},
            coderFixCycleRan: false,
            selectiveReReview: undefined,
          },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(0);
    });

    it('places orchestrator at level 0 when review has 1 reviewer', () => {
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
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(0);
    });

    it('counts only agents at orchestrator level when computing stackOffset at review station', () => {
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
              'security-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'performance-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
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

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');
      const reviewers = config.agents.filter((a) => a.roleType === PHASE_ROLE_TYPE.review);

      // 3 reviewers at levels 0, 1, 2 — orchestrator is on level 2 with 1 reviewer there
      expect(reviewers).toHaveLength(3);
      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(2);
      // Only the level-2 reviewer (performance-reviewer) is at the same level, so stackOffset = 1
      expect(orchestrator?.stackOffset).toBe(1);
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

  describe('constant synchronization', () => {
    it('REVIEW_STATION_INDEX matches the layout constant', () => {
      expect(REVIEW_STATION_INDEX).toBe(LAYOUT_REVIEW_STATION_INDEX);
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

import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../__test-helpers__/fixtures.js';
import { PHASE_ROLE, PHASE_ROLE_TYPE } from '../../../../shared/constants/role-types.js';
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

    it('marks review station active when parallelReview.status is in_progress', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.stations[3]?.active).toBe(true);
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
    it('places orchestrator at inferred frontier when architecture has data', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: undefined, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      // Architecture is completed, so planning (index 1) is the inferred current phase
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(1);
      expect(orchestrator?.level).toBe(0);
    });

    it('places orchestrator at review station when review is active and post-review phases are skipped', () => {
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(3);
      // Orchestrator approaches the station rather than occupying a grid slot
      expect(orchestrator?.stackOffset).toBe(0);
      expect(orchestrator?.approaching).toBe(true);
    });

    it('places orchestrator at inferred current phase when prior phases have data', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
        phaseDecisions: {
          architecture: { run: true, reason: undefined },
          planning: { run: true, reason: undefined },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      // Planning (index 1) is the inferred current phase; orchestrator should be there, not at architecture (index 0)
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(1);
    });

    it('does not create orchestrator when no phases are active on non-in_progress runs', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: emptyPhases(),
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeUndefined();
    });

    it('creates orchestrator at inferred phase when in_progress with empty phases', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(0);
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
      expect(orchestrator?.approaching).toBeUndefined();
    });

    it('places orchestrator with approaching flag at inferred station instead of grid offset', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: undefined, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');
      const planner = config.agents.find((a) => a.role === 'planner');

      // Planning (station 1) is the inferred current phase; orchestrator approaches rather than taking a grid slot
      expect(planner?.stationIndex).toBe(1);
      expect(orchestrator?.stationIndex).toBe(1);
      expect(orchestrator?.stackOffset).toBe(0);
      expect(orchestrator?.approaching).toBe(true);
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(1);
      expect(orchestrator?.stackOffset).toBe(0);
      expect(orchestrator?.approaching).toBe(true);
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(0);
    });

    it('places orchestrator with approaching flag at highest reviewer level with 3 reviewers', () => {
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
        phaseDecisions: {
          simplifier: { run: false, reason: 'skipped' },
          holistic: { run: false, reason: 'skipped' },
        },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');
      const reviewers = config.agents.filter(
        (a) => a.stationIndex === REVIEW_STATION_INDEX && a.role !== 'orchestrator',
      );

      // 3 reviewers at levels 0, 1, 2 — orchestrator approaches at level 2
      expect(reviewers).toHaveLength(3);
      expect(orchestrator?.stationIndex).toBe(3);
      expect(orchestrator?.level).toBe(2);
      expect(orchestrator?.stackOffset).toBe(0);
      expect(orchestrator?.approaching).toBe(true);
    });
  });

  describe('artifacts', () => {
    it('creates artifacts for phases that produced them (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(3);
      expect(config.artifacts[0]).toEqual({ type: 'architecture', stationIndex: 0, indexAtStation: 0 });
      expect(config.artifacts[1]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 0 });
      expect(config.artifacts[2]).toEqual({ type: 'code', stationIndex: 2, indexAtStation: 0 });
    });

    it('expands multiple planning.artifacts entries into separate configs with sequential indexAtStation (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan1.md', 'plan2.md', 'plan3.md'] },
        },
      });

      const config = createSceneConfig(status);
      const planArtifacts = config.artifacts.filter((a) => a.stationIndex === 1);

      expect(planArtifacts).toHaveLength(3);
      expect(planArtifacts[0]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 0 });
      expect(planArtifacts[1]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 1 });
      expect(planArtifacts[2]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 2 });
    });

    it('creates artifact for codeSimplifier when artifact is present (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          codeSimplifier: { ran: true, actionableFindings: true, coderFixCycleRan: false, artifact: 'simplifier.md' },
        },
      });

      const config = createSceneConfig(status);
      const simplifierArtifacts = config.artifacts.filter((a) => a.stationIndex === 4);

      expect(simplifierArtifacts).toHaveLength(1);
      expect(simplifierArtifacts[0]).toEqual({ type: 'simplifier', stationIndex: 4, indexAtStation: 0 });
    });

    it('creates artifact for holisticReview when artifact is present (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          holisticReview: {
            status: 'completed',
            criticality: 'low',
            reReviewCriticality: undefined,
            coderFixCycleRan: false,
            reviewRoundsUsed: 1,
            artifact: 'holistic.md',
          },
        },
      });

      const config = createSceneConfig(status);
      const holisticArtifacts = config.artifacts.filter((a) => a.stationIndex === 5);

      expect(holisticArtifacts).toHaveLength(1);
      expect(holisticArtifacts[0]).toEqual({ type: 'holistic', stationIndex: 5, indexAtStation: 0 });
    });

    it('does not create holisticReview artifact when artifact is undefined (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          holisticReview: {
            status: 'completed',
            criticality: 'low',
            reReviewCriticality: undefined,
            coderFixCycleRan: false,
            reviewRoundsUsed: 1,
            artifact: undefined,
          },
        },
      });

      const config = createSceneConfig(status);
      const holisticArtifacts = config.artifacts.filter((a) => a.stationIndex === 5);

      expect(holisticArtifacts).toHaveLength(0);
    });

    it('falls back to phase fields when status.artifacts is an empty array', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: [],
      });

      const config = createSceneConfig(status);

      // Empty array triggers fallback path, so phase-based artifacts should be returned
      expect(config.artifacts).toHaveLength(2);
      expect(config.artifacts[0]).toEqual({ type: 'architecture', stationIndex: 0, indexAtStation: 0 });
      expect(config.artifacts[1]).toEqual({ type: 'code', stationIndex: 2, indexAtStation: 0 });
    });

    it('does not create codeSimplifier artifact when artifact is undefined (fallback path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          codeSimplifier: { ran: true, actionableFindings: true, coderFixCycleRan: false, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const simplifierArtifacts = config.artifacts.filter((a) => a.stationIndex === 4);

      expect(simplifierArtifacts).toHaveLength(0);
    });

    it('uses top-level artifacts array as primary source when populated', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: createCompletedRunPhases(),
        artifacts: [
          {
            filename: 'arch.md',
            role: 'architect',
            roleType: 'analyst',
            agent: 'architect',
            type: 'architecture',
            phase: 'architecture',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'plan.md',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = createSceneConfig(status);

      // Should use the top-level artifacts array, not phase fields
      expect(config.artifacts).toHaveLength(2);
      expect(config.artifacts[0]).toEqual({ type: 'architecture', stationIndex: 0, indexAtStation: 0 });
      expect(config.artifacts[1]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 0 });
    });

    it('falls back to phase fields when status.artifacts is undefined', () => {
      const status = createMockRunStatus({
        status: 'completed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        artifacts: undefined,
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(2);
      expect(config.artifacts[0]).toEqual({ type: 'architecture', stationIndex: 0, indexAtStation: 0 });
      expect(config.artifacts[1]).toEqual({ type: 'code', stationIndex: 2, indexAtStation: 0 });
    });

    it('assigns correct indexAtStation for multiple artifacts at the same station (primary path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        artifacts: [
          {
            filename: 'plan1.md',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'plan2.json',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:11:00Z',
          },
          {
            filename: 'plan3.md',
            role: 'planner',
            roleType: 'planner',
            agent: 'planner',
            type: 'plan',
            phase: 'planning',
            createdAt: '2026-01-01T00:12:00Z',
          },
        ],
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(3);
      expect(config.artifacts[0]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 0 });
      expect(config.artifacts[1]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 1 });
      expect(config.artifacts[2]).toEqual({ type: 'plan', stationIndex: 1, indexAtStation: 2 });
    });

    it('maps codeSimplifier phase alias to station 4 (primary path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        artifacts: [
          {
            filename: 'simplifier.md',
            role: 'simplifier',
            roleType: 'reviewer',
            agent: 'code-simplifier',
            type: 'simplifier',
            phase: 'codeSimplifier',
            createdAt: '2026-01-01T00:40:00Z',
          },
        ],
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]).toEqual({ type: 'simplifier', stationIndex: 4, indexAtStation: 0 });
    });

    it('maps holisticReview phase alias to station 5 (primary path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        artifacts: [
          {
            filename: 'holistic.md',
            role: 'holistic-reviewer',
            roleType: 'reviewer',
            agent: 'holistic-reviewer',
            type: 'holistic',
            phase: 'holisticReview',
            createdAt: '2026-01-01T00:50:00Z',
          },
        ],
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]).toEqual({ type: 'holistic', stationIndex: 5, indexAtStation: 0 });
    });

    it('skips entries with unknown phases (primary path)', () => {
      const status = createMockRunStatus({
        status: 'completed',
        artifacts: [
          {
            filename: 'arch.md',
            role: 'architect',
            roleType: 'analyst',
            agent: 'architect',
            type: 'architecture',
            phase: 'architecture',
            createdAt: '2026-01-01T00:10:00Z',
          },
          {
            filename: 'unknown.md',
            role: 'unknown',
            roleType: 'unknown',
            agent: 'unknown',
            type: 'unknown',
            phase: 'unknownPhase',
            createdAt: '2026-01-01T00:20:00Z',
          },
        ],
      });

      const config = createSceneConfig(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]).toEqual({ type: 'architecture', stationIndex: 0, indexAtStation: 0 });
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

  it('handles all phases skipped on non-in_progress runs', () => {
    const status = createMockRunStatus({ status: 'failed' });

    const config = createSceneConfig(status);

    expect(config.stations.every((s) => !s.active)).toBe(true);
    expect(config.agents).toHaveLength(0);
    expect(config.artifacts).toHaveLength(0);
    expect(config.gates.every((g) => !g.open)).toBe(true);
  });

  it('infers first phase as active when in_progress with empty phases and no decisions', () => {
    const status = createMockRunStatus();

    const config = createSceneConfig(status);

    // Architecture station is inferred as active
    expect(config.stations[0]?.active).toBe(true);
    // Remaining stations are not active
    expect(config.stations.slice(1).every((s) => !s.active)).toBe(true);
    // Architect + orchestrator agents are created
    expect(config.agents).toHaveLength(2);
    expect(config.artifacts).toHaveLength(0);
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

    it('assigns station role from PHASE_ROLE for each phase', () => {
      const status = createMockRunStatus();

      const config = createSceneConfig(status);

      config.stations.forEach((station, i) => {
        const phase = PHASE_NAMES[i];
        if (phase !== undefined) {
          expect(station.role).toBe(PHASE_ROLE[phase]);
        }
      });
    });
  });

  describe('constant synchronization', () => {
    it('REVIEW_STATION_INDEX matches the layout constant', () => {
      expect(REVIEW_STATION_INDEX).toBe(LAYOUT_REVIEW_STATION_INDEX);
    });
  });

  describe('null phase values', () => {
    /**
     * The Zod schema allows null for phase values at runtime, but the TypeScript
     * Phases type uses `| undefined`. These tests verify that `isPresent()` guards
     * handle null phases correctly at runtime.
     *
     * JSON round-tripping produces runtime null values without type assertions:
     * undefined fields are stripped by JSON.stringify, explicit nulls are preserved.
     */
    /**
     * Create a status where specific phase fields are null (simulating Zod
     * runtime data). A phaseDecisions skip entry is added for each null phase
     * so that phase inference does not re-infer the null phase as "current"
     * (which would bypass the null-safety guard being tested).
     */
    function statusWithNullPhases(overrides: Record<string, null>) {
      const phases = Object.assign(emptyPhases(), overrides);
      const phaseDecisions: Record<string, { run: boolean; reason: string | undefined }> = {};
      for (const key of Object.keys(overrides)) {
        phaseDecisions[key] = { run: false, reason: undefined };
      }
      return createMockRunStatus({ status: 'in_progress', phases, phaseDecisions });
    }

    it('does not create architect agent when architecture phase is null', () => {
      const status = statusWithNullPhases({ architecture: null });

      const config = createSceneConfig(status);

      expect(config.agents.find((a) => a.role === 'architect')).toBeUndefined();
    });

    it('does not create planner agent when planning phase is null', () => {
      const status = statusWithNullPhases({ planning: null });

      const config = createSceneConfig(status);

      expect(config.agents.find((a) => a.role === 'planner')).toBeUndefined();
    });

    it('does not create coder agent when implementation phase is null', () => {
      const status = statusWithNullPhases({ implementation: null });

      const config = createSceneConfig(status);

      expect(config.agents.find((a) => a.role === 'coder')).toBeUndefined();
    });

    it('does not create reviewer agents when both review phases are null', () => {
      const status = statusWithNullPhases({ parallelReview: null, review: null });

      const config = createSceneConfig(status);

      const reviewerAgents = config.agents.filter((a) => a.roleType === PHASE_ROLE_TYPE.review);
      expect(reviewerAgents).toHaveLength(0);
    });

    it('does not create holistic-reviewer agent when holisticReview phase is null', () => {
      const status = statusWithNullPhases({ holisticReview: null });

      const config = createSceneConfig(status);

      expect(config.agents.find((a) => a.role === 'holistic-reviewer')).toBeUndefined();
    });

    it('marks station as inactive when phase is null', () => {
      const status = statusWithNullPhases({ architecture: null });

      const config = createSceneConfig(status);

      expect(config.stations[0]?.active).toBe(false);
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

  describe('phase inference (in_progress)', () => {
    it('creates agent for architecture phase when phases is empty and phaseDecisions.architecture.run is true', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: { architecture: { run: true, reason: undefined } },
      });

      const config = createSceneConfig(status);
      const architect = config.agents.find((a) => a.role === 'architect');

      expect(architect).toBeDefined();
      expect(architect?.stationIndex).toBe(0);
    });

    it('marks architecture station active when currentPhase is architecture and no phase data exists', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: { architecture: { run: true, reason: undefined } },
      });

      const config = createSceneConfig(status);

      expect(config.stations[0]?.active).toBe(true);
    });

    it('does not create agent when its phase is decided to skip and no phase data exists', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: {
          architecture: { run: false, reason: 'skipped' },
          planning: { run: true, reason: undefined },
        },
      });

      const config = createSceneConfig(status);
      const architect = config.agents.find((a) => a.role === 'architect');
      const planner = config.agents.find((a) => a.role === 'planner');

      expect(architect).toBeUndefined();
      expect(planner).toBeDefined();
      expect(planner?.stationIndex).toBe(1);
    });

    it('creates generic reviewer at station 3 when currentPhase is review and no review data exists', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        phaseDecisions: {
          architecture: { run: true, reason: undefined },
          planning: { run: true, reason: undefined },
          implementation: { run: true, reason: undefined },
          'review-cycle': { run: true, reason: undefined },
        },
      });

      const config = createSceneConfig(status);
      const reviewers = config.agents.filter(
        (a) => a.stationIndex === REVIEW_STATION_INDEX && a.role !== 'orchestrator',
      );

      expect(reviewers).toHaveLength(1);
      expect(reviewers[0]).toEqual({
        role: 'reviewer',
        roleType: 'reviewer',
        stationIndex: 3,
        stackOffset: 0,
        level: 0,
      });
    });

    it('positions orchestrator at architecture station when phases is empty and currentPhase is architecture', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: { architecture: { run: true, reason: undefined } },
      });

      const config = createSceneConfig(status);
      const orchestrator = config.agents.find((a) => a.role === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.stationIndex).toBe(0);
    });

    it('keeps gate between architecture and planning closed when only architecture is inferred-active', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: { architecture: { run: true, reason: undefined } },
      });

      const config = createSceneConfig(status);

      // Gate between station 0 (architecture) and station 1 (planning)
      expect(config.gates[0]?.open).toBe(false);
    });

    it('creates simplifier agent at station 4 when all prior phases have data and simplifier has no data or decision', () => {
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
        phaseDecisions: {
          architecture: { run: true, reason: undefined },
          planning: { run: true, reason: undefined },
          implementation: { run: true, reason: undefined },
          'review-cycle': { run: true, reason: undefined },
        },
      });

      const config = createSceneConfig(status);
      const simplifier = config.agents.find((a) => a.role === 'simplifier');

      expect(simplifier).toBeDefined();
      expect(simplifier?.stationIndex).toBe(4);
    });

    it('creates holistic-reviewer agent at station 5 when all prior phases including simplifier have data', () => {
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
        phaseDecisions: {
          architecture: { run: true, reason: undefined },
          planning: { run: true, reason: undefined },
          implementation: { run: true, reason: undefined },
          'review-cycle': { run: true, reason: undefined },
        },
      });

      const config = createSceneConfig(status);
      const holistic = config.agents.find((a) => a.role === 'holistic-reviewer');

      expect(holistic).toBeDefined();
      expect(holistic?.stationIndex).toBe(5);
    });

    it('does not infer simplifier as current when codeSimplifier has data with ran: false', () => {
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
          codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
        },
      });

      const config = createSceneConfig(status);
      const simplifier = config.agents.find((a) => a.role === 'simplifier');
      const holistic = config.agents.find((a) => a.role === 'holistic-reviewer');

      // Simplifier should NOT appear (ran: false means it was skipped, not inferred as current)
      expect(simplifier).toBeUndefined();
      // Holistic should appear as the inferred current phase
      expect(holistic).toBeDefined();
      expect(holistic?.stationIndex).toBe(5);
    });

    it('does not crash and produces no agents or active stations when phaseDecisions is empty and phases is empty with failed status', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: emptyPhases(),
        phaseDecisions: {},
      });

      const config = createSceneConfig(status);

      expect(config.stations.every((s) => !s.active)).toBe(true);
      expect(config.agents).toHaveLength(0);
    });
  });
});

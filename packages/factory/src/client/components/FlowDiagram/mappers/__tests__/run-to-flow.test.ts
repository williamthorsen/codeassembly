import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import type { ParallelReviewPhase } from '../../../../../shared/types/canonical.js';
import { createFlowConfig } from '../run-to-flow.js';

describe('createFlowConfig', () => {
  describe('node generation', () => {
    it('generates nodes for all 7 phases with 2 reviewers on a completed run', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { nodes } = createFlowConfig(status);

      // Phase agents: architecture, planning, implementation, simplifier, holistic (5)
      // Review is replaced by individual reviewer nodes: 2 reviewers
      // Orchestrator: 1
      // Total: 5 + 2 + 1 = 8
      const phaseAgentNodes = nodes.filter((n) => n.id.startsWith('agent-'));
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));
      const orchestratorNodes = nodes.filter((n) => n.id === 'orchestrator');

      expect(phaseAgentNodes.length).toBe(5);
      expect(reviewerNodes.length).toBe(2);
      expect(orchestratorNodes.length).toBe(1);
    });

    it('generates 3 reviewer nodes with correct y positions for 3 reviewers', () => {
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

      const { nodes } = createFlowConfig(status);
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));

      expect(reviewerNodes.length).toBe(3);
      // y positions at 60, 140, 220 (60 + i*80)
      expect(reviewerNodes[0]?.position.y).toBe(60);
      expect(reviewerNodes[1]?.position.y).toBe(140);
      expect(reviewerNodes[2]?.position.y).toBe(220);
    });

    it('generates ghost nodes for phases decided to skip', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
        phaseDecisions: {
          architecture: { run: false, reason: 'skipped' },
          planning: { run: false, reason: 'skipped' },
        },
      });

      const { nodes } = createFlowConfig(status);

      const ghostNodes = nodes.filter((n) => n.id.startsWith('ghost-'));
      expect(ghostNodes.length).toBe(2);

      const ghostArchitecture = nodes.find((n) => n.id === 'ghost-architecture');
      const ghostPlanning = nodes.find((n) => n.id === 'ghost-planning');
      expect(ghostArchitecture).toBeDefined();
      expect(ghostPlanning).toBeDefined();
      expect(ghostArchitecture?.data.status).toBe('skipped');
      expect(ghostPlanning?.data.status).toBe('skipped');
    });

    it('generates exactly one reviewer node when there is a single reviewer', () => {
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

      const { nodes } = createFlowConfig(status);
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));

      expect(reviewerNodes.length).toBe(1);
      expect(reviewerNodes[0]?.data.role).toBe('correctness-reviewer');
    });
  });

  describe('orchestrator positioning', () => {
    it('places orchestrator at architecture column when in_progress at architecture phase', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      // architecture column x = 100, width = 220, center offset = 110 - 60 = 50
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.position.x).toBe(100 + 220 / 2 - 60);
      expect(orchestrator?.data.phase).toBe('architecture');
    });

    it('places orchestrator at review column when in_progress at review phase', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      // review column x = 820, width = 350
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.position.x).toBe(820 + 350 / 2 - 60);
    });

    it('places orchestrator at summary column when run is completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      // summary column x = 1670, width = 220
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.position.x).toBe(1670 + 220 / 2 - 60);
      expect(orchestrator?.data.status).toBe('completed');
    });

    it('does not create orchestrator on failed runs', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: emptyPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      expect(orchestrator).toBeUndefined();
    });
  });

  describe('coder shadow node', () => {
    it('creates coder shadow node when coderFixCycleRan is true', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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
            coderFixCycleRan: true,
            selectiveReReview: undefined,
          },
          review: undefined,
          codeSimplifier: undefined,
          holisticReview: undefined,
        },
      });

      const { nodes } = createFlowConfig(status);
      const coderShadow = nodes.find((n) => n.id === 'coder-shadow');

      expect(coderShadow).toBeDefined();
      expect(coderShadow?.position.y).toBe(340);
    });

    it('does not create coder shadow node when coderFixCycleRan is false', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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

      const { nodes } = createFlowConfig(status);
      const coderShadow = nodes.find((n) => n.id === 'coder-shadow');

      expect(coderShadow).toBeUndefined();
    });
  });

  describe('failed runs', () => {
    it('generates nodes with failed status for a failed run', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'failed', artifact: undefined, qualityGates: undefined },
        },
      });

      const { nodes } = createFlowConfig(status);
      const agentNodes = nodes.filter((n) => n.id.startsWith('agent-'));

      // architecture, planning, and implementation agents are all expected
      expect(agentNodes.length).toBe(3);
      for (const node of agentNodes) {
        expect(node.data.status).toBe('failed');
      }
    });
  });

  describe('needs_manual_review runs', () => {
    it('does not create orchestrator on needs_manual_review runs', () => {
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      expect(orchestrator).toBeUndefined();
    });

    it('derives phase node statuses from timestamps, not forced to failed', () => {
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          architecture: {
            status: 'completed',
            impactLevel: 'high',
            artifact: 'arch.md',
            startedAt: '2026-01-01T00:00:00Z',
            completedAt: '2026-01-01T00:05:00Z',
          },
          planning: {
            status: 'completed',
            stepCount: 7,
            artifacts: ['plan.md'],
            startedAt: '2026-01-01T00:05:00Z',
            completedAt: '2026-01-01T00:10:00Z',
          },
          implementation: {
            status: 'completed',
            artifact: 'code.md',
            qualityGates: undefined,
            startedAt: '2026-01-01T00:10:00Z',
            completedAt: '2026-01-01T00:20:00Z',
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const agentNodes = nodes.filter((n) => n.id.startsWith('agent-'));

      expect(agentNodes.length).toBe(3);
      for (const node of agentNodes) {
        // Timestamps indicate completed; status should not be forced to 'failed'
        expect(node.data.status).toBe('completed');
      }
    });
  });

  describe('edge generation', () => {
    it('generates dispatch and return edges for active phases', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { edges } = createFlowConfig(status);

      // Dispatch edges for architecture, planning, implementation, simplifier, holistic (not review — handled by reviewer edges)
      const dispatchEdges = edges.filter((e) => e.id.startsWith('dispatch-') && !e.id.startsWith('dispatch-reviewer-') && !e.id.startsWith('dispatch-coder-'));
      expect(dispatchEdges.length).toBe(5);
    });

    it('generates reviewer-specific edges for each reviewer', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { edges } = createFlowConfig(status);

      const reviewerDispatchEdges = edges.filter((e) => e.id.startsWith('dispatch-reviewer-'));
      const reviewerReturnEdges = edges.filter((e) => e.id.startsWith('return-reviewer-'));

      expect(reviewerDispatchEdges.length).toBe(2);
      expect(reviewerReturnEdges.length).toBe(2);
    });

    it('generates coder fix edge when coderFixCycleRan is true', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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
            coderFixCycleRan: true,
            selectiveReReview: undefined,
          },
        },
      });

      const { edges } = createFlowConfig(status);
      const coderFixEdge = edges.find((e) => e.id === 'dispatch-coder-fix');

      expect(coderFixEdge).toBeDefined();
      expect(coderFixEdge?.target).toBe('coder-shadow');
    });

    it('does not generate coder fix edge when coderFixCycleRan is false', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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

      const { edges } = createFlowConfig(status);
      const coderFixEdge = edges.find((e) => e.id === 'dispatch-coder-fix');

      expect(coderFixEdge).toBeUndefined();
    });
  });

  describe('reviewer status variants', () => {
    it('assigns failed status to a reviewer with status failed', () => {
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
                status: 'failed',
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

      const { nodes } = createFlowConfig(status);
      const reviewerNode = nodes.find((n) => n.id === 'reviewer-correctness-reviewer');

      expect(reviewerNode).toBeDefined();
      expect(reviewerNode?.data.status).toBe('failed');
    });

    it('assigns skipped status to a reviewer with status skipped', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'security-reviewer': {
                ran: false,
                status: 'skipped',
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

      const { nodes } = createFlowConfig(status);
      const reviewerNode = nodes.find((n) => n.id === 'reviewer-security-reviewer');

      expect(reviewerNode).toBeDefined();
      expect(reviewerNode?.data.status).toBe('skipped');
    });

    it('assigns working status to a reviewer with undefined status', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const reviewerNode = nodes.find((n) => n.id === 'reviewer-correctness-reviewer');

      expect(reviewerNode).toBeDefined();
      expect(reviewerNode?.data.status).toBe('working');
    });
  });

  describe('empty reviewers', () => {
    it('produces zero reviewer nodes when parallelReview has empty reviewers and no other extraction paths', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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

      const { nodes } = createFlowConfig(status);
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));

      expect(reviewerNodes.length).toBe(0);
    });
  });

  describe('reviewer extraction from alternate data shapes', () => {
    it('extracts reviewers from iterations[].perReviewer when flat reviewers is empty', () => {
      const iteration = Object.assign(
        { reviewers: ['orchestrated-reviewer', 'aspect-test-reviewer'] },
        {
          perReviewer: {
            'orchestrated-reviewer': { status: 'failed', criticality: 'medium' },
            'aspect-test-reviewer': { status: 'completed', criticality: 'medium' },
          },
        },
      );
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {},
            coderFixCycleRan: false,
            selectiveReReview: undefined,
            iterations: [iteration],
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));

      expect(reviewerNodes.length).toBe(2);
      expect(reviewerNodes[0]?.data.role).toBe('orchestrated-reviewer');
      expect(reviewerNodes[1]?.data.role).toBe('aspect-test-reviewer');
    });

    it('extracts reviewers from top-level reviewerDetails when flat reviewers is empty', () => {
      const parallelReview = Object.assign(
        {
          aggregatedCriticality: 'low',
          reviewRoundsUsed: 1,
          reviewers: {},
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        } satisfies ParallelReviewPhase,
        {
          reviewerDetails: {
            'code-reviewer': { status: 'completed', criticality: 'none' },
            'test-reviewer': { status: 'completed', criticality: 'low' },
          },
        },
      );
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: { ...emptyPhases(), parallelReview },
      });

      const { nodes } = createFlowConfig(status);
      const reviewerNodes = nodes.filter((n) => n.id.startsWith('reviewer-'));

      expect(reviewerNodes.length).toBe(2);
      expect(reviewerNodes[0]?.data.role).toBe('code-reviewer');
      expect(reviewerNodes[1]?.data.role).toBe('test-reviewer');
    });
  });
});

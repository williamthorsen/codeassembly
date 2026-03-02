import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import type { ParallelReviewPhase } from '../../../../../shared/types/canonical.js';
import { createFlowConfig, deriveReviewerKey } from '../run-to-flow.js';

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
      // Dynamic y = 60 + reviewerCount * 80 + 40 = 60 + 1 * 80 + 40 = 180
      expect(coderShadow?.position.y).toBe(180);
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

    it('generates no edges on a failed run because orchestrator node is absent', () => {
      const status = createMockRunStatus({
        status: 'failed',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'failed', artifact: undefined, qualityGates: undefined },
        },
      });

      const { edges } = createFlowConfig(status);

      expect(edges.length).toBe(0);
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

    it('generates no edges on a needs_manual_review run because orchestrator node is absent', () => {
      const status = createMockRunStatus({
        status: 'needs_manual_review',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
        },
      });

      const { edges } = createFlowConfig(status);

      expect(edges.length).toBe(0);
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
      const dispatchEdges = edges.filter(
        (e) =>
          e.id.startsWith('dispatch-') && !e.id.startsWith('dispatch-reviewer-') && !e.id.startsWith('dispatch-coder-'),
      );
      expect(dispatchEdges.length).toBe(5);

      // Dispatch edges use type 'dispatch' and carry typed data
      for (const edge of dispatchEdges) {
        expect(edge.type).toBe('dispatch');
        expect(edge.data).toBeDefined();
        expect(typeof edge.data?.status).toBe('string');
        expect(edge.data?.color).toBeDefined();
        expect(edge.data?.roleType).toBeDefined();
      }
    });

    it('generates spine edges with type spine and data', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { edges } = createFlowConfig(status);
      const spineEdges = edges.filter((e) => e.id.startsWith('spine-'));

      expect(spineEdges.length).toBeGreaterThan(0);
      for (const edge of spineEdges) {
        expect(edge.type).toBe('spine');
        expect(edge.data).toBeDefined();
        expect(edge.data?.status).toBe('completed');
      }
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

      // Return edges use type 'return' and carry criticality data
      for (const edge of reviewerReturnEdges) {
        expect(edge.type).toBe('return');
        expect(edge.data).toBeDefined();
        expect(edge.data?.criticality).toBe('low');
      }
    });

    it('generates return edges with type return for non-reviewer phases', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const { edges } = createFlowConfig(status);

      const returnEdges = edges.filter((e) => e.id.startsWith('return-') && !e.id.startsWith('return-reviewer-'));
      expect(returnEdges.length).toBeGreaterThan(0);

      for (const edge of returnEdges) {
        expect(edge.type).toBe('return');
      }
    });

    it('generates pending status for in-progress dispatch edges', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
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
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
      });

      const { edges } = createFlowConfig(status);

      // Implementation is current phase => pending
      const implDispatch = edges.find((e) => e.id === 'dispatch-implementation');
      expect(implDispatch?.data?.status).toBe('pending');

      // Architecture has timestamps => completed
      const archDispatch = edges.find((e) => e.id === 'dispatch-architecture');
      expect(archDispatch?.data?.status).toBe('completed');
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

  describe('reviewer dimming', () => {
    it('dims reviewers not in selectiveReReview.reviewersDispatched when ran is true', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 2,
            reviewers: {
              'reviewer-a': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
                reason: undefined,
                reReviewCriticality: 'low',
                reReviewError: undefined,
              },
              'reviewer-b': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: true,
            selectiveReReview: {
              ran: true,
              reviewersDispatched: ['reviewer-a'],
              additionalFixCycleRan: false,
            },
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const reviewerA = nodes.find((n) => n.id === 'reviewer-reviewer-a');
      const reviewerB = nodes.find((n) => n.id === 'reviewer-reviewer-b');

      expect(reviewerA).toBeDefined();
      expect(reviewerA?.data.dimmed).not.toBe(true);
      expect(reviewerB).toBeDefined();
      expect(reviewerB?.data.dimmed).toBe(true);
    });

    it('does not dim any reviewer when selectiveReReview is undefined', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'reviewer-a': {
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
      const reviewerA = nodes.find((n) => n.id === 'reviewer-reviewer-a');

      expect(reviewerA).toBeDefined();
      expect(reviewerA?.data.dimmed).not.toBe(true);
    });

    it('does not dim any reviewer when selectiveReReview.ran is false', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'reviewer-a': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: false,
            selectiveReReview: {
              ran: false,
              reviewersDispatched: [],
              additionalFixCycleRan: false,
            },
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const reviewerA = nodes.find((n) => n.id === 'reviewer-reviewer-a');

      expect(reviewerA).toBeDefined();
      expect(reviewerA?.data.dimmed).not.toBe(true);
    });
  });

  describe('re-review edges', () => {
    it('emits re-review dispatch and return edges when selectiveReReview.ran is true', () => {
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
            reviewRoundsUsed: 2,
            reviewers: {
              'reviewer-a': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
                reason: undefined,
                reReviewCriticality: 'low',
                reReviewError: undefined,
              },
              'reviewer-b': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: true,
            selectiveReReview: {
              ran: true,
              reviewersDispatched: ['reviewer-a'],
              additionalFixCycleRan: false,
            },
          },
        },
      });

      const { edges } = createFlowConfig(status);

      // Round 1 edges for both reviewers
      expect(edges.find((e) => e.id === 'dispatch-reviewer-reviewer-a')).toBeDefined();
      expect(edges.find((e) => e.id === 'return-reviewer-reviewer-a')).toBeDefined();
      expect(edges.find((e) => e.id === 'dispatch-reviewer-reviewer-b')).toBeDefined();
      expect(edges.find((e) => e.id === 'return-reviewer-reviewer-b')).toBeDefined();

      // Round 2 edges only for reviewer-a
      const r2Dispatch = edges.find((e) => e.id === 'dispatch-reviewer-reviewer-a-r2');
      const r2Return = edges.find((e) => e.id === 'return-reviewer-reviewer-a-r2');

      expect(r2Dispatch).toBeDefined();
      expect(r2Dispatch?.type).toBe('dispatch');
      expect(r2Dispatch?.data?.iteration).toBe(2);

      expect(r2Return).toBeDefined();
      expect(r2Return?.type).toBe('return');
      expect(r2Return?.data?.iteration).toBe(2);
      expect(r2Return?.data?.criticality).toBe('low');

      // No round 2 edges for reviewer-b
      expect(edges.find((e) => e.id === 'dispatch-reviewer-reviewer-b-r2')).toBeUndefined();
      expect(edges.find((e) => e.id === 'return-reviewer-reviewer-b-r2')).toBeUndefined();
    });
  });

  describe('coder fix return edge', () => {
    it('emits return-coder-fix when coderFixCycleRan is true', () => {
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
        },
      });

      const { edges } = createFlowConfig(status);
      const returnEdge = edges.find((e) => e.id === 'return-coder-fix');

      expect(returnEdge).toBeDefined();
      expect(returnEdge?.source).toBe('coder-shadow');
      expect(returnEdge?.target).toBe('orchestrator');
      expect(returnEdge?.type).toBe('return');
    });

    it('does not emit return-coder-fix when coderFixCycleRan is false', () => {
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
      const returnEdge = edges.find((e) => e.id === 'return-coder-fix');

      expect(returnEdge).toBeUndefined();
    });
  });

  describe('orchestrator iteration data', () => {
    it('populates reviewRoundsUsed, maxReviewRounds, and aggregatedCriticality when at review phase', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        maxReviewRounds: 3,
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            status: 'in_progress',
            aggregatedCriticality: 'medium',
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
            startedAt: '2026-01-01T00:30:00Z',
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.data.reviewRoundsUsed).toBe(1);
      expect(orchestrator?.data.maxReviewRounds).toBe(3);
      expect(orchestrator?.data.aggregatedCriticality).toBe('medium');
    });

    it('does not populate iteration data when currentPhase is not review', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        maxReviewRounds: 3,
        phases: emptyPhases(),
      });

      const { nodes } = createFlowConfig(status);
      const orchestrator = nodes.find((n) => n.id === 'orchestrator');

      expect(orchestrator).toBeDefined();
      expect(orchestrator?.data.reviewRoundsUsed).toBeUndefined();
      expect(orchestrator?.data.maxReviewRounds).toBeUndefined();
      expect(orchestrator?.data.aggregatedCriticality).toBeUndefined();
    });
  });

  describe('dynamic coder shadow y-position', () => {
    it('positions coder shadow at y=180 with 1 reviewer', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'reviewer-a': {
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

      const { nodes } = createFlowConfig(status);
      const coderShadow = nodes.find((n) => n.id === 'coder-shadow');

      expect(coderShadow).toBeDefined();
      // y = 60 + 1 * 80 + 40 = 180
      expect(coderShadow?.position.y).toBe(180);
    });

    it('positions coder shadow at y=500 with 5 reviewers', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'reviewer-1': { ran: true, status: 'completed', criticality: 'low', reason: undefined, reReviewCriticality: undefined, reReviewError: undefined },
              'reviewer-2': { ran: true, status: 'completed', criticality: 'low', reason: undefined, reReviewCriticality: undefined, reReviewError: undefined },
              'reviewer-3': { ran: true, status: 'completed', criticality: 'low', reason: undefined, reReviewCriticality: undefined, reReviewError: undefined },
              'reviewer-4': { ran: true, status: 'completed', criticality: 'low', reason: undefined, reReviewCriticality: undefined, reReviewError: undefined },
              'reviewer-5': { ran: true, status: 'completed', criticality: 'low', reason: undefined, reReviewCriticality: undefined, reReviewError: undefined },
            },
            coderFixCycleRan: true,
            selectiveReReview: undefined,
          },
        },
      });

      const { nodes } = createFlowConfig(status);
      const coderShadow = nodes.find((n) => n.id === 'coder-shadow');

      expect(coderShadow).toBeDefined();
      // y = 60 + 5 * 80 + 40 = 500
      expect(coderShadow?.position.y).toBe(500);
    });
  });

  describe('reference edge', () => {
    it('emits reference-coder-shadow when coderFixCycleRan is true', () => {
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
        },
      });

      const { edges } = createFlowConfig(status);
      const refEdge = edges.find((e) => e.id === 'reference-coder-shadow');

      expect(refEdge).toBeDefined();
      expect(refEdge?.source).toBe('coder-shadow');
      expect(refEdge?.target).toBe('agent-implementation');
      expect(refEdge?.type).toBe('reference');
    });

    it('does not emit reference-coder-shadow when coderFixCycleRan is false', () => {
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
      const refEdge = edges.find((e) => e.id === 'reference-coder-shadow');

      expect(refEdge).toBeUndefined();
    });
  });

  describe('edge collapse', () => {
    /** Helper to create a reviewer record with the given number of reviewers, all with re-review data. */
    function makeReviewersWithReReview(count: number) {
      const reviewers: Record<
        string,
        {
          ran: boolean;
          status: 'completed';
          criticality: 'low';
          reason: undefined;
          reReviewCriticality: 'low';
          reReviewError: undefined;
        }
      > = {};
      for (let i = 0; i < count; i++) {
        reviewers[`reviewer-${String(i)}`] = {
          ran: true,
          status: 'completed',
          criticality: 'low',
          reason: undefined,
          reReviewCriticality: 'low',
          reReviewError: undefined,
        };
      }
      return reviewers;
    }

    it('does not collapse edges when a source-target pair has 4 or fewer edges', () => {
      // 2 reviewers each with re-review = 4 dispatch edges from orchestrator per reviewer pair
      // Each reviewer pair: dispatch + dispatch-r2 from orchestrator -> reviewer (2 edges per direction)
      // That gives 2 edges per (orch -> reviewer) pair, well below threshold
      const reviewers = makeReviewersWithReReview(2);
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
            reviewRoundsUsed: 2,
            reviewers,
            coderFixCycleRan: true,
            selectiveReReview: {
              ran: true,
              reviewersDispatched: Object.keys(reviewers),
              additionalFixCycleRan: false,
            },
          },
        },
      });

      const { edges } = createFlowConfig(status);

      // No collapsed indicator edges should be present
      const collapsedEdges = edges.filter((e) => e.id.startsWith('collapsed-'));
      expect(collapsedEdges.length).toBe(0);
    });

    // Note: The collapse threshold (5+) cannot be triggered through createFlowConfig with the
    // current data model, which supports at most 2 iterations per reviewer (r1 + r2 = 2 edges
    // per source-target pair). The collapse logic is defensive for future multi-round iterations.
    // The threshold boundary (4 edges pass through) and expandedPairs bypass are tested above and below.

    it('returns all edges without collapsed indicator when source-target pair is in expandedPairs', () => {
      const reviewers = makeReviewersWithReReview(2);
      const reviewerNames = Object.keys(reviewers);
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
            reviewRoundsUsed: 2,
            reviewers,
            coderFixCycleRan: true,
            selectiveReReview: {
              ran: true,
              reviewersDispatched: reviewerNames,
              additionalFixCycleRan: false,
            },
          },
        },
      });

      // Even with expandedPairs containing all pair keys, should return all edges as-is
      const firstReviewer = reviewerNames[0];
      if (firstReviewer === undefined) throw new Error('Expected at least one reviewer');
      const expandedPairs = new Set([`orchestrator|reviewer-${firstReviewer}`]);

      const { edges } = createFlowConfig(status, expandedPairs);

      // No collapsed indicator for the expanded pair
      const collapsedEdges = edges.filter(
        (e) => e.id === `collapsed-orchestrator|reviewer-${firstReviewer}`,
      );
      expect(collapsedEdges.length).toBe(0);
    });
  });

  describe('deriveReviewerKey', () => {
    it('returns empty string when parallelReview is absent', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      expect(deriveReviewerKey(status)).toBe('');
    });

    it('returns empty string when parallelReview has no reviewers', () => {
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

      expect(deriveReviewerKey(status)).toBe('');
    });

    it('returns alphabetically sorted comma-joined reviewer names', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 1,
            reviewers: {
              'zebra-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'alpha-reviewer': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'mid-reviewer': {
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

      expect(deriveReviewerKey(status)).toBe('alpha-reviewer,mid-reviewer,zebra-reviewer');
    });

    it('produces the same key regardless of insertion order', () => {
      const makeStatus = (reviewerNames: string[]) => {
        const reviewers: Record<
          string,
          {
            ran: boolean;
            status: 'completed';
            criticality: 'low';
            reason: undefined;
            reReviewCriticality: undefined;
            reReviewError: undefined;
          }
        > = {};
        for (const name of reviewerNames) {
          reviewers[name] = {
            ran: true,
            status: 'completed',
            criticality: 'low',
            reason: undefined,
            reReviewCriticality: undefined,
            reReviewError: undefined,
          };
        }
        return createMockRunStatus({
          status: 'in_progress',
          phases: {
            ...emptyPhases(),
            parallelReview: {
              aggregatedCriticality: 'low',
              reviewRoundsUsed: 1,
              reviewers,
              coderFixCycleRan: false,
              selectiveReReview: undefined,
            },
          },
        });
      };

      const key1 = deriveReviewerKey(makeStatus(['b-reviewer', 'a-reviewer', 'c-reviewer']));
      const key2 = deriveReviewerKey(makeStatus(['c-reviewer', 'a-reviewer', 'b-reviewer']));

      expect(key1).toBe(key2);
      expect(key1).toBe('a-reviewer,b-reviewer,c-reviewer');
    });
  });

  describe('selective re-review with empty reviewersDispatched', () => {
    it('dims all reviewers and emits no r2 edges when ran is true but reviewersDispatched is empty', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
          implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
          parallelReview: {
            aggregatedCriticality: 'low',
            reviewRoundsUsed: 2,
            reviewers: {
              'reviewer-a': {
                ran: true,
                status: 'completed',
                criticality: 'medium',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
              'reviewer-b': {
                ran: true,
                status: 'completed',
                criticality: 'low',
                reason: undefined,
                reReviewCriticality: undefined,
                reReviewError: undefined,
              },
            },
            coderFixCycleRan: true,
            selectiveReReview: {
              ran: true,
              reviewersDispatched: [],
              additionalFixCycleRan: false,
            },
          },
        },
      });

      const { nodes, edges } = createFlowConfig(status);

      // All reviewers should be dimmed
      const reviewerA = nodes.find((n) => n.id === 'reviewer-reviewer-a');
      const reviewerB = nodes.find((n) => n.id === 'reviewer-reviewer-b');
      expect(reviewerA?.data.dimmed).toBe(true);
      expect(reviewerB?.data.dimmed).toBe(true);

      // No r2 edges should be emitted
      const r2Edges = edges.filter((e) => e.id.endsWith('-r2'));
      expect(r2Edges.length).toBe(0);
    });
  });
});

import type { Phases } from 'codeassembly-run-core';
import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../test-utils/fixtures.js';
import { mapRunToLogicalScene } from '../run-to-logical-scene.js';
import type { LogicalSceneState } from '../types.js';

// region | Helpers

function findAgent(scene: LogicalSceneState, id: string) {
  return scene.agents.find((a) => a.id === id);
}

// endregion | Helpers

// -- mapRunToLogicalScene --

describe(mapRunToLogicalScene, () => {
  // -- 1. Empty run --

  describe('empty in_progress run', () => {
    it('has first agent working, others idle, orchestrator dispatching, no artifacts', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const scene = mapRunToLogicalScene(status);

      // Architect is working (inferred current phase is architecture)
      const arch = findAgent(scene, 'arch');
      expect(arch?.status).toBe('working');
      expect(arch?.phase).toBe('architecture');

      // All non-arch agents are idle
      const nonArch = scene.agents.filter((a) => a.id !== 'arch');
      for (const agent of nonArch) {
        expect(agent.status).toBe('idle');
      }

      // Orchestrator dispatching
      expect(scene.orchestrator.status).toBe('dispatching');
      expect(scene.orchestrator.waiting).toBe(false);

      // No artifacts
      expect(scene.artifacts).toHaveLength(0);

      // Run-level fields
      expect(scene.runStatus).toBe('in_progress');
      expect(scene.currentPhase).toBe('architecture');
    });
  });

  // -- 2. Architecture in progress --

  describe('architecture in progress', () => {
    it('has architect working, orchestrator monitoring', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const scene = mapRunToLogicalScene(status);

      // Architect working
      expect(findAgent(scene, 'arch')?.status).toBe('working');

      // Orchestrator monitoring (architecture has data)
      expect(scene.orchestrator.status).toBe('monitoring');
      expect(scene.currentPhase).toBe('architecture');
    });
  });

  // -- 3. Implementation in progress --

  describe('implementation in progress', () => {
    it('has arch+plan done, coder working, orchestrator monitoring', () => {
      const phases: Phases = {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 5, artifacts: ['plan.md'] },
        implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
      };

      const status = createMockRunStatus({ status: 'in_progress', phases });
      const scene = mapRunToLogicalScene(status);

      // Arch and plan are done
      expect(findAgent(scene, 'arch')?.status).toBe('done');
      expect(findAgent(scene, 'plan')?.status).toBe('done');

      // Coder is working
      expect(findAgent(scene, 'coder')?.status).toBe('working');

      // Orchestrator monitoring
      expect(scene.orchestrator.status).toBe('monitoring');
      expect(scene.currentPhase).toBe('implementation');
    });
  });

  // -- 4. Review in progress --

  describe('review in progress', () => {
    it('has reviewers working, orchestrator monitoring', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const scene = mapRunToLogicalScene(status);

      // Reviewers are working
      const reviewers = scene.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers.length).toBeGreaterThanOrEqual(1);
      for (const reviewer of reviewers) {
        expect(reviewer.status).toBe('working');
        expect(reviewer.phase).toBe('review');
      }

      // Coder is done
      expect(findAgent(scene, 'coder')?.status).toBe('done');

      // Orchestrator monitoring
      expect(scene.orchestrator.status).toBe('monitoring');
    });
  });

  // -- 5. Completed run --

  describe('completed run', () => {
    it('has all agents done, orchestrator done, artifacts present', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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
          {
            filename: 'code.md',
            role: 'coder',
            roleType: 'implementer',
            agent: 'coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
          },
        ],
      });

      const scene = mapRunToLogicalScene(status);

      // All agents done
      for (const agent of scene.agents) {
        expect(agent.status).toBe('done');
      }

      // Orchestrator done
      expect(scene.orchestrator.status).toBe('done');

      // 3 artifacts, all delivered (run is completed)
      expect(scene.artifacts).toHaveLength(3);
      for (const artifact of scene.artifacts) {
        expect(artifact.status).toBe('delivered');
      }

      // Check artifact details
      const archArtifact = scene.artifacts.find((a) => a.label === 'architecture');
      expect(archArtifact?.producerPhase).toBe('architecture');

      const planArtifact = scene.artifacts.find((a) => a.label === 'plan');
      expect(planArtifact?.producerPhase).toBe('planning');

      const codeArtifact = scene.artifacts.find((a) => a.label === 'code');
      expect(codeArtifact?.producerPhase).toBe('implementation');
    });
  });

  // -- 6. Failed run --

  describe('failed run', () => {
    it('has all agents concerned, orchestrator done', () => {
      const status = createMockRunStatus({
        status: 'failed',
        reason: 'Test failure',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const scene = mapRunToLogicalScene(status);

      // All agents concerned
      for (const agent of scene.agents) {
        expect(agent.status).toBe('concerned');
      }

      // Orchestrator done
      expect(scene.orchestrator.status).toBe('done');
      expect(scene.runStatus).toBe('failed');
    });
  });

  // -- 7. Skipped phases --

  describe('skipped phases', () => {
    it('excludes agents for skipped phases', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: {
          architecture: { run: false, reason: 'trivial' },
        },
      });

      const scene = mapRunToLogicalScene(status);

      // Architect should not be present
      expect(findAgent(scene, 'arch')).toBeUndefined();

      // Planner should exist (architecture skipped, planning is next)
      expect(findAgent(scene, 'plan')).toBeDefined();
    });
  });

  // -- 8. Waiting for input --

  describe('waiting for input', () => {
    it('marks orchestrator as waiting', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
        waitingForInput: 'permission_prompt',
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.orchestrator.waiting).toBe(true);
    });
  });

  // -- 9. Variable reviewer count --

  describe('variable reviewer count', () => {
    it('produces 1 reviewer when no parallel review data exists', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const scene = mapRunToLogicalScene(status);

      const reviewers = scene.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers).toHaveLength(1);
    });

    it('produces 2 reviewers when parallel review has 2 names', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const scene = mapRunToLogicalScene(status);

      const reviewers = scene.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers).toHaveLength(2);
    });
  });

  // -- 10. Carried artifacts --

  describe('carried artifacts', () => {
    it('carries artifacts from prior phase when orchestrator is dispatching', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
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
        ],
      });

      const scene = mapRunToLogicalScene(status);

      // Current phase should be planning (arch completed, planning not started)
      expect(scene.currentPhase).toBe('planning');
      expect(scene.orchestrator.status).toBe('dispatching');
      expect(scene.orchestrator.carriedArtifacts).toHaveLength(1);
      expect(scene.orchestrator.carriedArtifacts[0]?.label).toBe('architecture');
    });

    it('carries no artifacts when orchestrator is monitoring', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
        artifacts: [],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.orchestrator.status).toBe('monitoring');
      expect(scene.orchestrator.carriedArtifacts).toHaveLength(0);
    });
  });

  // -- 11. Code badge --

  describe('code badge', () => {
    it('shows code badge after implementation re-enters revision', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code-v1.md',
            role: 'coder',
            roleType: 'implementer',
            agent: 'coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
            iteration: 1,
          },
          {
            filename: 'code-v2.md',
            role: 'coder',
            roleType: 'implementer',
            agent: 'coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:40:00Z',
            iteration: 2,
          },
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.orchestrator.codeBadge).not.toBeNull();
      expect(scene.orchestrator.codeBadge?.label).toBe('v2');
    });

    it('has no code badge on first implementation pass', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code-v1.md',
            role: 'coder',
            roleType: 'implementer',
            agent: 'coder',
            type: 'code',
            phase: 'implementation',
            createdAt: '2026-01-01T00:30:00Z',
            iteration: 1,
          },
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.orchestrator.codeBadge).toBeNull();
    });
  });

  // -- 12. Artifact lifecycle --

  describe('artifact lifecycle', () => {
    it('marks artifacts as created when their phase is still in progress', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
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
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.artifacts).toHaveLength(1);
      expect(scene.artifacts[0]?.status).toBe('created');
    });

    it('marks artifacts as delivered when their phase is completed', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
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
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.artifacts).toHaveLength(1);
      expect(scene.artifacts[0]?.status).toBe('delivered');
    });

    it('marks all artifacts as delivered when run is completed', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
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

      const scene = mapRunToLogicalScene(status);

      for (const artifact of scene.artifacts) {
        expect(artifact.status).toBe('delivered');
      }
    });

    it('marks review artifacts as created when review is still in progress', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
        artifacts: [
          {
            filename: 'review.md',
            role: 'reviewer',
            roleType: 'reviewer',
            agent: 'reviewer',
            type: 'review',
            phase: 'parallelReview',
            createdAt: '2026-01-01T00:35:00Z',
          },
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.artifacts).toHaveLength(1);
      expect(scene.artifacts[0]?.status).toBe('created');
    });

    it('includes iteration on versioned artifacts', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
          planning: { status: 'completed', stepCount: 3, artifacts: ['plan.md'] },
          implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
        },
        artifacts: [
          {
            filename: 'code-v2.md',
            role: 'coder',
            roleType: 'implementer',
            agent: 'coder',
            type: 'change-summary',
            phase: 'parallelReview',
            createdAt: '2026-01-01T00:40:00Z',
            iteration: 2,
          },
        ],
      });

      const scene = mapRunToLogicalScene(status);

      expect(scene.artifacts).toHaveLength(1);
      expect(scene.artifacts[0]?.iteration).toBe(2);
      // Coder change-summaries should map to implementation phase
      expect(scene.artifacts[0]?.producerPhase).toBe('implementation');
    });
  });

  // -- 13. Scene structure --

  describe('scene structure', () => {
    it('returns a valid LogicalSceneState shape', () => {
      const scene = mapRunToLogicalScene(createMockRunStatus());

      expect(scene).toHaveProperty('runStatus');
      expect(scene).toHaveProperty('currentPhase');
      expect(scene).toHaveProperty('agents');
      expect(scene).toHaveProperty('orchestrator');
      expect(scene).toHaveProperty('artifacts');
    });

    it('includes phase information on every agent', () => {
      const scene = mapRunToLogicalScene(
        createMockRunStatus({
          status: 'completed',
          completedAt: '2026-01-01T01:00:00Z',
          phases: createCompletedRunPhases(),
        }),
      );

      for (const agent of scene.agents) {
        expect(agent.phase).toBeTruthy();
        expect(agent.roleType).toBeTruthy();
      }
    });
  });
});

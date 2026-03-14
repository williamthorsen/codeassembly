import { describe, expect, it } from 'vitest';

import {
  createCompletedRunPhases,
  createInProgressReviewPhases,
  createMockRunStatus,
  emptyPhases,
} from '../../../../../__test-helpers__/fixtures.js';
import type { Phases } from '../../../../../shared/types/canonical.js';
import type { TilemapSceneConfig } from '../../types.js';
import { mapRunToTilemap } from '../run-to-tilemap.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findAgent(config: TilemapSceneConfig, id: string) {
  return config.agents.find((a) => a.id === id);
}

function findRoom(config: TilemapSceneConfig, id: string) {
  return config.rooms.find((r) => r.id === id);
}

// ---------------------------------------------------------------------------
// 1. Empty run
// ---------------------------------------------------------------------------

describe('mapRunToTilemap', () => {
  describe('empty in_progress run', () => {
    it('has all agents idle, orchestrator dispatching in analysis, no artifacts', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToTilemap(status);

      // Architect is working (inferred current phase is architecture)
      const arch = findAgent(config, 'arch');
      expect(arch?.status).toBe('working');
      expect(arch?.roomId).toBe('analysis');
      expect(arch?.slotId).toBe('analysis-ws-0');

      // All non-arch agents are idle
      const nonArch = config.agents.filter((a) => a.id !== 'arch');
      for (const agent of nonArch) {
        expect(agent.status).toBe('idle');
      }

      // Orchestrator dispatching in analysis
      expect(config.orchestrator.roomId).toBe('analysis');
      expect(config.orchestrator.status).toBe('dispatching');
      expect(config.orchestrator.waiting).toBe(false);

      // No artifacts
      expect(config.artifacts).toHaveLength(0);

      // Analysis room is active
      expect(findRoom(config, 'analysis')?.active).toBe(true);
      expect(findRoom(config, 'analysis')?.completed).toBe(false);

      // Other rooms are inactive
      expect(findRoom(config, 'workshop')?.active).toBe(false);
      expect(findRoom(config, 'review-bay')?.active).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Architecture in progress
  // ---------------------------------------------------------------------------

  describe('architecture in progress', () => {
    it('has architect working, orchestrator monitoring in analysis', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
      });

      const config = mapRunToTilemap(status);

      // Architect working
      expect(findAgent(config, 'arch')?.status).toBe('working');

      // Orchestrator monitoring (architecture has data)
      expect(config.orchestrator.roomId).toBe('analysis');
      expect(config.orchestrator.status).toBe('monitoring');

      // Analysis active, not completed
      expect(findRoom(config, 'analysis')?.active).toBe(true);
      expect(findRoom(config, 'analysis')?.completed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Implementation in progress
  // ---------------------------------------------------------------------------

  describe('implementation in progress', () => {
    it('has arch+plan done, coder working, orchestrator in workshop', () => {
      const phases: Phases = {
        ...emptyPhases(),
        architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        planning: { status: 'completed', stepCount: 5, artifacts: ['plan.md'] },
        implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
      };

      const status = createMockRunStatus({ status: 'in_progress', phases });
      const config = mapRunToTilemap(status);

      // Arch and plan are done
      expect(findAgent(config, 'arch')?.status).toBe('done');
      expect(findAgent(config, 'plan')?.status).toBe('done');

      // Coder is working
      expect(findAgent(config, 'coder')?.status).toBe('working');
      expect(findAgent(config, 'coder')?.roomId).toBe('workshop');

      // Orchestrator in workshop, monitoring
      expect(config.orchestrator.roomId).toBe('workshop');
      expect(config.orchestrator.status).toBe('monitoring');

      // Analysis completed, workshop active
      expect(findRoom(config, 'analysis')?.completed).toBe(true);
      expect(findRoom(config, 'workshop')?.active).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Review in progress
  // ---------------------------------------------------------------------------

  describe('review in progress', () => {
    it('has reviewers working in review-bay, orchestrator monitoring', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
      });

      const config = mapRunToTilemap(status);

      // Reviewers are working
      const reviewers = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers.length).toBeGreaterThanOrEqual(1);
      for (const reviewer of reviewers) {
        expect(reviewer.status).toBe('working');
        expect(reviewer.roomId).toBe('review-bay');
      }

      // Coder is done
      expect(findAgent(config, 'coder')?.status).toBe('done');

      // Orchestrator in review-bay, monitoring
      expect(config.orchestrator.roomId).toBe('review-bay');
      expect(config.orchestrator.status).toBe('monitoring');

      // Review-bay active
      expect(findRoom(config, 'review-bay')?.active).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Completed run
  // ---------------------------------------------------------------------------

  describe('completed run', () => {
    it('has all agents done, orchestrator done in control, artifacts on desks', () => {
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

      const config = mapRunToTilemap(status);

      // All agents done
      for (const agent of config.agents) {
        expect(agent.status).toBe('done');
      }

      // Orchestrator done in control
      expect(config.orchestrator.roomId).toBe('control');
      expect(config.orchestrator.status).toBe('done');

      // 3 artifacts
      expect(config.artifacts).toHaveLength(3);

      // Architecture artifact in analysis room
      const archArtifact = config.artifacts.find((a) => a.label === 'architecture');
      expect(archArtifact?.roomId).toBe('analysis');
      expect(archArtifact?.slotId).toBe('analysis-ws-0');
      expect(archArtifact?.side).toBe('output');

      // Plan artifact in analysis room
      const planArtifact = config.artifacts.find((a) => a.label === 'plan');
      expect(planArtifact?.roomId).toBe('analysis');
      expect(planArtifact?.slotId).toBe('analysis-ws-1');

      // Code artifact in workshop
      const codeArtifact = config.artifacts.find((a) => a.label === 'code');
      expect(codeArtifact?.roomId).toBe('workshop');
      expect(codeArtifact?.slotId).toBe('workshop-ws-0');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Failed run
  // ---------------------------------------------------------------------------

  describe('failed run', () => {
    it('has all agents concerned, orchestrator done, rooms have alerts', () => {
      const status = createMockRunStatus({
        status: 'failed',
        reason: 'Test failure',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      });

      const config = mapRunToTilemap(status);

      // All agents concerned
      for (const agent of config.agents) {
        expect(agent.status).toBe('concerned');
      }

      // Orchestrator done
      expect(config.orchestrator.status).toBe('done');
      expect(config.orchestrator.roomId).toBe('control');

      // Rooms with agents have alerts
      const analysisRoom = findRoom(config, 'analysis');
      expect(analysisRoom?.hasAlerts).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Skipped phases
  // ---------------------------------------------------------------------------

  describe('skipped phases', () => {
    it('excludes agents for skipped phases', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
        phaseDecisions: {
          architecture: { run: false, reason: 'trivial' },
        },
      });

      const config = mapRunToTilemap(status);

      // Architect should not be present
      expect(findAgent(config, 'arch')).toBeUndefined();

      // Planner should exist (architecture skipped, planning is next)
      expect(findAgent(config, 'plan')).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Waiting for input
  // ---------------------------------------------------------------------------

  describe('waiting for input', () => {
    it('marks orchestrator as waiting', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: {
          ...emptyPhases(),
          architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
        },
        waitingForInput: { type: 'user_approval', message: 'Approve plan' },
      });

      const config = mapRunToTilemap(status);

      expect(config.orchestrator.waiting).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Variable reviewer count
  // ---------------------------------------------------------------------------

  describe('variable reviewer count', () => {
    it('produces 1 reviewer when no parallel review data exists', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToTilemap(status);

      const reviewers = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers).toHaveLength(1);
      expect(reviewers[0]?.slotId).toBe('review-ws-0');
    });

    it('produces 2 reviewers when parallel review has 2 names', () => {
      const status = createMockRunStatus({
        status: 'completed',
        completedAt: '2026-01-01T01:00:00Z',
        phases: createCompletedRunPhases(),
      });

      const config = mapRunToTilemap(status);

      const reviewers = config.agents.filter((a) => a.id.startsWith('reviewer-'));
      expect(reviewers).toHaveLength(2);
      expect(reviewers[0]?.slotId).toBe('review-ws-0');
      expect(reviewers[1]?.slotId).toBe('review-ws-1');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Coder change-summary during review
  // ---------------------------------------------------------------------------

  describe('coder change-summary during review', () => {
    it('places coder change-summary in workshop, not review-bay', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: createInProgressReviewPhases(),
        artifacts: [
          {
            filename: 'change.md',
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

      const config = mapRunToTilemap(status);

      expect(config.artifacts).toHaveLength(1);
      expect(config.artifacts[0]?.roomId).toBe('workshop');
      expect(config.artifacts[0]?.slotId).toBe('workshop-ws-0');
      expect(config.artifacts[0]?.version).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Thought bubbles
  // ---------------------------------------------------------------------------

  describe('thought bubbles', () => {
    it('includes thought bubbles in the scene config', () => {
      const status = createMockRunStatus({
        status: 'in_progress',
        phases: emptyPhases(),
      });

      const config = mapRunToTilemap(status);

      expect(config.thoughtBubbles.length).toBeGreaterThan(0);
      expect(config.thoughtBubbles[0]?.agentId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Scene config structure
  // ---------------------------------------------------------------------------

  describe('scene config structure', () => {
    it('always includes all 5 rooms', () => {
      const config = mapRunToTilemap(createMockRunStatus());

      expect(config.rooms).toHaveLength(5);
      const roomIds = config.rooms.map((r) => r.id);
      expect(roomIds).toContain('analysis');
      expect(roomIds).toContain('control');
      expect(roomIds).toContain('workshop');
      expect(roomIds).toContain('review-bay');
      expect(roomIds).toContain('delivery');
    });

    it('returns a valid TilemapSceneConfig shape', () => {
      const config = mapRunToTilemap(createMockRunStatus());

      expect(config).toHaveProperty('rooms');
      expect(config).toHaveProperty('orchestrator');
      expect(config).toHaveProperty('agents');
      expect(config).toHaveProperty('artifacts');
      expect(config).toHaveProperty('thoughtBubbles');
    });
  });
});

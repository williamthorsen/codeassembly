import { describe, expect, it } from 'vitest';

import { MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from '../../constants/dimensions.js';
import type { TilemapSceneConfig } from '../../types.js';
import { createFacilityLayout } from '../facility-layout.js';
import { ARTIFACT_SIDE_OFFSET, resolvePositions } from '../position-resolver.js';
import { findSlotById } from '../room-definitions.js';

const layout = createFacilityLayout();

/** Build a minimal scene config for testing. */
function createTestConfig(overrides: Partial<TilemapSceneConfig> = {}): TilemapSceneConfig {
  return {
    rooms: [],
    orchestrator: {
      roomId: 'control',
      status: 'idle',
      carriedArtifacts: [],
      codeBadge: null,
      waiting: false,
    },
    agents: [],
    artifacts: [],
    thoughtBubbles: [],
    ...overrides,
  };
}

describe(resolvePositions, () => {
  describe('agent positions', () => {
    it('resolves an agent at a known slot to the expected pixel position', () => {
      const config = createTestConfig({
        agents: [
          {
            id: 'arch',
            role: 'architect',
            roleType: 'analyst',
            status: 'working',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
          },
        ],
      });

      const result = resolvePositions(config, layout);

      expect(result.agents).toHaveLength(1);
      const agent = result.agents[0];
      expect(agent).toBeDefined();
      // analysis-ws-0 is at tileX:3, tileY:5
      expect(agent?.x).toBe(3 * TILE_SIZE);
      expect(agent?.y).toBe(5 * TILE_SIZE);
    });

    it('includes the facing direction from the slot definition', () => {
      const config = createTestConfig({
        agents: [
          {
            id: 'arch',
            role: 'architect',
            roleType: 'analyst',
            status: 'working',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
          },
        ],
      });

      const result = resolvePositions(config, layout);

      const slotEntry = findSlotById('analysis-ws-0');
      expect(slotEntry).toBeDefined();
      expect(result.agents[0]?.facing).toBe(slotEntry?.slot.facing);
    });

    it.each([
      ['analysis-ws-0', 'up'],
      ['control-ws-0', 'down'],
      ['review-ws-3', 'down'],
    ] as const)('resolves facing direction for slot %s as %s', (slotId, expectedFacing) => {
      const config = createTestConfig({
        agents: [
          { id: 'test-agent', role: 'tester', roleType: 'analyst', status: 'working', roomId: 'analysis', slotId },
        ],
      });

      const result = resolvePositions(config, layout);
      expect(result.agents[0]?.facing).toBe(expectedFacing);
    });
  });

  describe('orchestrator position', () => {
    it('resolves to the room center of the assigned room', () => {
      const config = createTestConfig({
        orchestrator: {
          roomId: 'control',
          status: 'monitoring',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
        },
      });

      const result = resolvePositions(config, layout);
      const expectedCenter = layout.roomCenter('control');

      expect(result.orchestrator.entityId).toBe('orchestrator');
      expect(result.orchestrator.x).toBe(expectedCenter.x);
      expect(result.orchestrator.y).toBe(expectedCenter.y);
    });
  });

  describe('artifact positions', () => {
    it('offsets input artifacts by -8 pixels on x from the slot position', () => {
      const config = createTestConfig({
        artifacts: [
          {
            id: 'art-1',
            label: 'plan',
            color: '#fff',
            status: 'on_desk',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
            side: 'input',
          },
        ],
      });

      const result = resolvePositions(config, layout);
      const slotPos = layout.slotPosition('analysis-ws-0');

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]?.x).toBe(slotPos.x - ARTIFACT_SIDE_OFFSET);
      expect(result.artifacts[0]?.y).toBe(slotPos.y);
    });

    it('offsets output artifacts by +8 pixels on x from the slot position', () => {
      const config = createTestConfig({
        artifacts: [
          {
            id: 'art-2',
            label: 'code',
            color: '#0f0',
            status: 'on_desk',
            roomId: 'workshop',
            slotId: 'workshop-ws-0',
            side: 'output',
          },
        ],
      });

      const result = resolvePositions(config, layout);
      const slotPos = layout.slotPosition('workshop-ws-0');

      expect(result.artifacts[0]?.x).toBe(slotPos.x + ARTIFACT_SIDE_OFFSET);
      expect(result.artifacts[0]?.y).toBe(slotPos.y);
    });
  });

  describe('bounds validation', () => {
    it('resolves all positions within map bounds', () => {
      const config = createTestConfig({
        orchestrator: {
          roomId: 'control',
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
        },
        agents: [
          {
            id: 'arch',
            role: 'architect',
            roleType: 'analyst',
            status: 'working',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
          },
          {
            id: 'coder',
            role: 'coder',
            roleType: 'author',
            status: 'working',
            roomId: 'workshop',
            slotId: 'workshop-ws-0',
          },
          {
            id: 'reviewer-0',
            role: 'reviewer',
            roleType: 'reviewer',
            status: 'working',
            roomId: 'review-bay',
            slotId: 'review-ws-0',
          },
        ],
        artifacts: [
          {
            id: 'art-in',
            label: 'input',
            color: '#fff',
            status: 'on_desk',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
            side: 'input',
          },
          {
            id: 'art-out',
            label: 'output',
            color: '#0f0',
            status: 'on_desk',
            roomId: 'workshop',
            slotId: 'workshop-ws-0',
            side: 'output',
          },
        ],
      });

      const result = resolvePositions(config, layout);

      const allPositions = [result.orchestrator, ...result.agents, ...result.artifacts];
      for (const pos of allPositions) {
        expect(pos.x).toBeGreaterThanOrEqual(0);
        expect(pos.x).toBeLessThanOrEqual(MAP_WIDTH);
        expect(pos.y).toBeGreaterThanOrEqual(0);
        expect(pos.y).toBeLessThanOrEqual(MAP_HEIGHT);
      }
    });
  });
});

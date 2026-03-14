import { describe, expect, it } from 'vitest';

import type { ThoughtBubbleConfig, TilemapAgentState, TilemapArtifactState, TilemapSceneConfig } from '../../types.js';
import { diffTilemapConfigs } from '../tilemap-differ.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** Minimal scene config with sensible defaults. */
function createMinimalConfig(overrides?: Partial<TilemapSceneConfig>): TilemapSceneConfig {
  return {
    rooms: [
      { id: 'analysis', active: false, completed: false, hasAlerts: false },
      { id: 'control', active: false, completed: false, hasAlerts: false },
      { id: 'workshop', active: false, completed: false, hasAlerts: false },
      { id: 'review-bay', active: false, completed: false, hasAlerts: false },
      { id: 'delivery', active: false, completed: false, hasAlerts: false },
    ],
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

/** Minimal agent state factory. */
function createAgent(id: string, overrides?: Partial<TilemapAgentState>): TilemapAgentState {
  return {
    id,
    role: id,
    roleType: 'author',
    status: 'idle',
    roomId: 'workshop',
    slotId: 'workshop-slot-0',
    ...overrides,
  };
}

/** Minimal artifact state factory. */
function createArtifact(id: string, overrides?: Partial<TilemapArtifactState>): TilemapArtifactState {
  return {
    id,
    label: id,
    color: '#ffffff',
    status: 'on_desk',
    roomId: 'workshop',
    slotId: 'workshop-output-0',
    side: 'output',
    ...overrides,
  };
}

/** Minimal thought bubble config factory. */
function createBubble(agentId: string, overrides?: Partial<ThoughtBubbleConfig>): ThoughtBubbleConfig {
  return {
    agentId,
    agentRole: agentId,
    roleType: 'author',
    phase: 'implementation',
    texts: [{ content: 'Working...', category: 'task' }],
    severity: 'normal',
    staggerOffsetMs: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe(diffTilemapConfigs, () => {
  describe('no changes', () => {
    it('returns hasChanges false when configs are identical', () => {
      const config = createMinimalConfig();
      const diff = diffTilemapConfigs(config, config);

      expect(diff.hasChanges).toBe(false);
      expect(diff.orchestrator.moved).toBeNull();
      expect(diff.orchestrator.statusChanged).toBeNull();
      expect(diff.orchestrator.waitingChanged).toBeNull();
      expect(diff.orchestrator.carriedChanged).toBe(false);
      expect(diff.orchestrator.codeBadgeChanged).toBe(false);
      expect(diff.agents).toEqual([]);
      expect(diff.artifacts.added).toEqual([]);
      expect(diff.artifacts.statusChanged).toEqual([]);
      expect(diff.thoughtBubbles.updated).toEqual([]);
      expect(diff.thoughtBubbles.added).toEqual([]);
      expect(diff.thoughtBubbles.removed).toEqual([]);
      expect(diff.rooms).toEqual([]);
    });
  });

  describe('orchestrator movement', () => {
    it('detects orchestrator moving between rooms', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: { roomId: 'workshop', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.moved).toEqual({ fromRoom: 'control', toRoom: 'workshop' });
    });

    it('returns moved null when room is unchanged', () => {
      const config = createMinimalConfig();
      const diff = diffTilemapConfigs(config, config);

      expect(diff.orchestrator.moved).toBeNull();
    });
  });

  describe('orchestrator status', () => {
    it('detects status change from idle to monitoring', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'control',
          status: 'monitoring',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
        },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.statusChanged).toEqual({ from: 'idle', to: 'monitoring' });
    });

    it('returns statusChanged null when status is unchanged', () => {
      const config = createMinimalConfig();
      const diff = diffTilemapConfigs(config, config);

      expect(diff.orchestrator.statusChanged).toBeNull();
    });
  });

  describe('orchestrator waiting', () => {
    it('detects waiting toggled from false to true', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: true },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.waitingChanged).toEqual({ from: false, to: true });
    });

    it('detects waiting toggled from true to false', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: true },
      });
      const next = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.waitingChanged).toEqual({ from: true, to: false });
    });
  });

  describe('orchestrator carried artifacts', () => {
    it('detects carried artifact changes', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'control',
          status: 'idle',
          carriedArtifacts: [{ label: 'plan', color: '#b2f2bb' }],
          codeBadge: null,
          waiting: false,
        },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.carriedChanged).toBe(true);
    });

    it('returns carriedChanged false when carried artifacts are identical', () => {
      const carried = [{ label: 'plan', color: '#b2f2bb' }];
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: carried, codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'control',
          status: 'idle',
          carriedArtifacts: [{ label: 'plan', color: '#b2f2bb' }],
          codeBadge: null,
          waiting: false,
        },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.orchestrator.carriedChanged).toBe(false);
    });
  });

  describe('orchestrator code badge', () => {
    it('detects code badge appearance', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'control',
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: { label: 'v2', color: '#ffaa00' },
          waiting: false,
        },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.codeBadgeChanged).toBe(true);
    });

    it('returns codeBadgeChanged false when badges are identical', () => {
      const badge = { label: 'v2', color: '#ffaa00' };
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: badge, waiting: false },
      });
      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'control',
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: { label: 'v2', color: '#ffaa00' },
          waiting: false,
        },
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.orchestrator.codeBadgeChanged).toBe(false);
    });
  });

  describe('agent diffs', () => {
    it('detects agent status change from idle to working', () => {
      const prev = createMinimalConfig({ agents: [createAgent('coder', { status: 'idle' })] });
      const next = createMinimalConfig({ agents: [createAgent('coder', { status: 'working' })] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]).toEqual({
        agentId: 'coder',
        statusChanged: { from: 'idle', to: 'working' },
        slotChanged: null,
      });
    });

    it('detects agent slot change', () => {
      const prev = createMinimalConfig({ agents: [createAgent('coder', { slotId: 'workshop-slot-0' })] });
      const next = createMinimalConfig({ agents: [createAgent('coder', { slotId: 'workshop-slot-1' })] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.agents[0]).toEqual({
        agentId: 'coder',
        statusChanged: null,
        slotChanged: { fromSlot: 'workshop-slot-0', toSlot: 'workshop-slot-1' },
      });
    });

    it('creates a diff entry for a new agent', () => {
      const prev = createMinimalConfig({ agents: [] });
      const next = createMinimalConfig({ agents: [createAgent('reviewer-0', { status: 'working' })] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]).toEqual({
        agentId: 'reviewer-0',
        statusChanged: { from: 'working', to: 'working' },
        slotChanged: null,
      });
    });

    it('returns empty array when agents are unchanged', () => {
      const agents = [createAgent('coder')];
      const prev = createMinimalConfig({ agents });
      const diff = diffTilemapConfigs(prev, prev);

      expect(diff.agents).toEqual([]);
    });
  });

  describe('artifact diffs', () => {
    it('detects a new artifact as added', () => {
      const artifact = createArtifact('plan-1');
      const prev = createMinimalConfig({ artifacts: [] });
      const next = createMinimalConfig({ artifacts: [artifact] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.artifacts.added).toEqual([artifact]);
    });

    it('detects artifact status change from on_desk to delivered', () => {
      const prev = createMinimalConfig({ artifacts: [createArtifact('plan-1', { status: 'on_desk' })] });
      const next = createMinimalConfig({ artifacts: [createArtifact('plan-1', { status: 'delivered' })] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.artifacts.statusChanged).toEqual([{ id: 'plan-1', from: 'on_desk', to: 'delivered' }]);
    });

    it('returns empty arrays when artifacts are unchanged', () => {
      const artifacts = [createArtifact('plan-1')];
      const prev = createMinimalConfig({ artifacts });
      const diff = diffTilemapConfigs(prev, prev);

      expect(diff.artifacts.added).toEqual([]);
      expect(diff.artifacts.statusChanged).toEqual([]);
    });
  });

  describe('thought bubble diffs', () => {
    it('detects a new thought bubble as added', () => {
      const prev = createMinimalConfig({ thoughtBubbles: [] });
      const next = createMinimalConfig({ thoughtBubbles: [createBubble('coder')] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.thoughtBubbles.added).toEqual(['coder']);
    });

    it('detects a removed thought bubble', () => {
      const prev = createMinimalConfig({ thoughtBubbles: [createBubble('coder')] });
      const next = createMinimalConfig({ thoughtBubbles: [] });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.thoughtBubbles.removed).toEqual(['coder']);
    });

    it('detects an updated thought bubble when texts change', () => {
      const prev = createMinimalConfig({
        thoughtBubbles: [createBubble('coder', { texts: [{ content: 'Working...', category: 'task' }] })],
      });
      const next = createMinimalConfig({
        thoughtBubbles: [createBubble('coder', { texts: [{ content: 'Almost done!', category: 'progress' }] })],
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.thoughtBubbles.updated).toEqual(['coder']);
    });

    it('returns empty arrays when thought bubbles are unchanged', () => {
      const bubbles = [createBubble('coder')];
      const prev = createMinimalConfig({ thoughtBubbles: bubbles });
      const diff = diffTilemapConfigs(prev, prev);

      expect(diff.thoughtBubbles.updated).toEqual([]);
      expect(diff.thoughtBubbles.added).toEqual([]);
      expect(diff.thoughtBubbles.removed).toEqual([]);
    });
  });

  describe('room diffs', () => {
    it('detects room active state change from false to true', () => {
      const prev = createMinimalConfig();
      const next = createMinimalConfig({
        rooms: [
          { id: 'analysis', active: true, completed: false, hasAlerts: false },
          { id: 'control', active: false, completed: false, hasAlerts: false },
          { id: 'workshop', active: false, completed: false, hasAlerts: false },
          { id: 'review-bay', active: false, completed: false, hasAlerts: false },
          { id: 'delivery', active: false, completed: false, hasAlerts: false },
        ],
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.rooms).toEqual([{ roomId: 'analysis', field: 'active', from: false, to: true }]);
    });

    it('detects room completed state change', () => {
      const prev = createMinimalConfig();
      const next = createMinimalConfig({
        rooms: [
          { id: 'analysis', active: false, completed: true, hasAlerts: false },
          { id: 'control', active: false, completed: false, hasAlerts: false },
          { id: 'workshop', active: false, completed: false, hasAlerts: false },
          { id: 'review-bay', active: false, completed: false, hasAlerts: false },
          { id: 'delivery', active: false, completed: false, hasAlerts: false },
        ],
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.rooms).toEqual([{ roomId: 'analysis', field: 'completed', from: false, to: true }]);
    });

    it('detects room hasAlerts state change', () => {
      const prev = createMinimalConfig();
      const next = createMinimalConfig({
        rooms: [
          { id: 'analysis', active: false, completed: false, hasAlerts: true },
          { id: 'control', active: false, completed: false, hasAlerts: false },
          { id: 'workshop', active: false, completed: false, hasAlerts: false },
          { id: 'review-bay', active: false, completed: false, hasAlerts: false },
          { id: 'delivery', active: false, completed: false, hasAlerts: false },
        ],
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.rooms).toEqual([{ roomId: 'analysis', field: 'hasAlerts', from: false, to: true }]);
    });

    it('detects multiple field changes across rooms', () => {
      const prev = createMinimalConfig();
      const next = createMinimalConfig({
        rooms: [
          { id: 'analysis', active: true, completed: false, hasAlerts: false },
          { id: 'control', active: false, completed: false, hasAlerts: false },
          { id: 'workshop', active: true, completed: false, hasAlerts: true },
          { id: 'review-bay', active: false, completed: false, hasAlerts: false },
          { id: 'delivery', active: false, completed: false, hasAlerts: false },
        ],
      });
      const diff = diffTilemapConfigs(prev, next);

      expect(diff.rooms).toHaveLength(3);
    });

    it('returns empty array when rooms are unchanged', () => {
      const config = createMinimalConfig();
      const diff = diffTilemapConfigs(config, config);

      expect(diff.rooms).toEqual([]);
    });
  });

  describe('combined changes', () => {
    it('detects changes across all sub-diffs simultaneously', () => {
      const prev = createMinimalConfig({
        orchestrator: { roomId: 'control', status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
        agents: [createAgent('coder', { status: 'idle' })],
        artifacts: [createArtifact('plan-1', { status: 'on_desk' })],
        thoughtBubbles: [createBubble('coder')],
      });

      const next = createMinimalConfig({
        orchestrator: {
          roomId: 'workshop',
          status: 'monitoring',
          carriedArtifacts: [{ label: 'plan', color: '#b2f2bb' }],
          codeBadge: { label: 'v2', color: '#ffaa00' },
          waiting: true,
        },
        agents: [
          createAgent('coder', { status: 'working' }),
          createAgent('reviewer-0', { status: 'idle', roomId: 'review-bay' }),
        ],
        artifacts: [createArtifact('plan-1', { status: 'delivered' }), createArtifact('code-1')],
        thoughtBubbles: [
          createBubble('coder', { texts: [{ content: 'Implementing...', category: 'task' }] }),
          createBubble('reviewer-0'),
        ],
        rooms: [
          { id: 'analysis', active: false, completed: true, hasAlerts: false },
          { id: 'control', active: false, completed: false, hasAlerts: false },
          { id: 'workshop', active: true, completed: false, hasAlerts: false },
          { id: 'review-bay', active: false, completed: false, hasAlerts: false },
          { id: 'delivery', active: false, completed: false, hasAlerts: false },
        ],
      });

      const diff = diffTilemapConfigs(prev, next);

      expect(diff.hasChanges).toBe(true);
      expect(diff.orchestrator.moved).not.toBeNull();
      expect(diff.orchestrator.statusChanged).not.toBeNull();
      expect(diff.orchestrator.waitingChanged).not.toBeNull();
      expect(diff.orchestrator.carriedChanged).toBe(true);
      expect(diff.orchestrator.codeBadgeChanged).toBe(true);
      expect(diff.agents.length).toBeGreaterThan(0);
      expect(diff.artifacts.added.length).toBeGreaterThan(0);
      expect(diff.artifacts.statusChanged.length).toBeGreaterThan(0);
      expect(diff.thoughtBubbles.updated.length).toBeGreaterThan(0);
      expect(diff.thoughtBubbles.added.length).toBeGreaterThan(0);
      expect(diff.rooms.length).toBeGreaterThan(0);
    });
  });
});

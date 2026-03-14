import { describe, expect, it } from 'vitest';

import type { FacilityLayout, Position, ResolvedPositions, TilemapDiff } from '../../types.js';
import { planTransitions } from '../transition-planner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyDiff(): TilemapDiff {
  return {
    orchestrator: {
      moved: null,
      statusChanged: null,
      waitingChanged: null,
      carriedChanged: false,
      codeBadgeChanged: false,
    },
    agents: [],
    artifacts: { added: [], statusChanged: [] },
    thoughtBubbles: { updated: [], added: [], removed: [] },
    rooms: [],
    hasChanges: false,
  };
}

function positions(overrides?: Partial<ResolvedPositions>): ResolvedPositions {
  return {
    orchestrator: { entityId: 'orchestrator', x: 100, y: 100 },
    agents: [],
    artifacts: [],
    ...overrides,
  };
}

/** Minimal mock layout that provides corridor paths. */
function mockLayout(): FacilityLayout {
  const corridorPaths: Record<string, Position[]> = {
    'control->analysis': [
      { x: 352, y: 128 },
      { x: 320, y: 128 },
    ],
    'analysis->workshop': [
      { x: 320, y: 128 },
      { x: 320, y: 288 },
      { x: 320, y: 448 },
    ],
  };

  return {
    rooms: {},
    slotPosition: () => ({ x: 0, y: 0 }),
    roomCenter: () => ({ x: 0, y: 0 }),
    slotsInRoom: () => [],
    corridorPath: (from: string, to: string) => {
      const key = `${from}->${to}`;
      return corridorPaths[key] ?? [];
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('planTransitions', () => {
  it('returns empty plan when no changes', () => {
    const diff = emptyDiff();
    const prev = positions();
    const next = positions();

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(0);
    expect(plan.totalDurationMs).toBe(0);
  });

  it('produces a walk transition when orchestrator moves', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        moved: { fromRoom: 'control', toRoom: 'analysis' },
      },
      hasChanges: true,
    };

    const prev = positions({ orchestrator: { entityId: 'orchestrator', x: 480, y: 160 } });
    const next = positions({ orchestrator: { entityId: 'orchestrator', x: 176, y: 144 } });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(1);
    const walk = plan.transitions[0]!;
    expect(walk.type).toBe('walk');
    expect(walk.entityId).toBe('orchestrator');
    expect(walk.from).toEqual({ x: 480, y: 160 });
    expect(walk.to).toEqual({ x: 176, y: 144 });
    // Path includes start + corridor waypoints + end
    expect(walk.path!.length).toBeGreaterThanOrEqual(3);
    expect(walk.durationMs).toBeGreaterThan(0);
  });

  it('produces a state_change transition when agent status changes', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      agents: [{ agentId: 'arch', statusChanged: { from: 'idle', to: 'working' }, slotChanged: null }],
      hasChanges: true,
    };

    const prev = positions({
      agents: [{ entityId: 'arch', x: 96, y: 160 }],
    });
    const next = positions({
      agents: [{ entityId: 'arch', x: 96, y: 160 }],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(1);
    const change = plan.transitions[0]!;
    expect(change.type).toBe('state_change');
    expect(change.entityId).toBe('arch');
  });

  it('produces a fade_in transition for a new agent', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      agents: [{ agentId: 'reviewer-0', statusChanged: { from: 'idle', to: 'idle' }, slotChanged: null }],
      hasChanges: true,
    };

    // New agent — not in prev
    const prev = positions({ agents: [] });
    const next = positions({
      agents: [{ entityId: 'reviewer-0', x: 608, y: 512 }],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(1);
    const fadeIn = plan.transitions[0]!;
    expect(fadeIn.type).toBe('fade_in');
    expect(fadeIn.entityId).toBe('reviewer-0');
    expect(fadeIn.to).toEqual({ x: 608, y: 512 });
  });

  it('produces an artifact_appear transition for a new artifact', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      artifacts: {
        added: [
          {
            id: 'architecture:architecture:0',
            label: 'architecture',
            color: '#4a90d9',
            status: 'on_desk',
            roomId: 'analysis',
            slotId: 'analysis-ws-0',
            side: 'output',
          },
        ],
        statusChanged: [],
      },
      hasChanges: true,
    };

    const prev = positions();
    const next = positions({
      artifacts: [{ entityId: 'architecture:architecture:0', x: 104, y: 160 }],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(1);
    const appear = plan.transitions[0]!;
    expect(appear.type).toBe('artifact_appear');
    expect(appear.entityId).toBe('architecture:architecture:0');
  });

  it('produces an artifact_deliver transition when status changes to delivered', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      artifacts: {
        added: [],
        statusChanged: [{ id: 'arch:arch:0', from: 'on_desk', to: 'delivered' }],
      },
      hasChanges: true,
    };

    const prev = positions();
    const next = positions({
      artifacts: [{ entityId: 'arch:arch:0', x: 200, y: 300 }],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(1);
    expect(plan.transitions[0]!.type).toBe('artifact_deliver');
  });

  it('staggers multiple transitions with increasing delay', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        moved: { fromRoom: 'control', toRoom: 'analysis' },
        statusChanged: { from: 'idle', to: 'dispatching' },
      },
      agents: [{ agentId: 'arch', statusChanged: { from: 'idle', to: 'working' }, slotChanged: null }],
      hasChanges: true,
    };

    const prev = positions({
      orchestrator: { entityId: 'orchestrator', x: 480, y: 160 },
      agents: [{ entityId: 'arch', x: 96, y: 160 }],
    });
    const next = positions({
      orchestrator: { entityId: 'orchestrator', x: 176, y: 144 },
      agents: [{ entityId: 'arch', x: 96, y: 160 }],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    // Walk + status change (orchestrator) + state_change (agent) = 3 transitions
    expect(plan.transitions.length).toBe(3);

    // Delays should be strictly increasing
    const delays = plan.transitions.map((t) => t.delayMs);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]!).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it('computes totalDurationMs as the end time of the last transition', () => {
    const diff: TilemapDiff = {
      ...emptyDiff(),
      agents: [
        { agentId: 'arch', statusChanged: { from: 'idle', to: 'working' }, slotChanged: null },
        { agentId: 'plan', statusChanged: { from: 'idle', to: 'working' }, slotChanged: null },
      ],
      hasChanges: true,
    };

    const prev = positions({
      agents: [
        { entityId: 'arch', x: 96, y: 160 },
        { entityId: 'plan', x: 224, y: 160 },
      ],
    });
    const next = positions({
      agents: [
        { entityId: 'arch', x: 96, y: 160 },
        { entityId: 'plan', x: 224, y: 160 },
      ],
    });

    const plan = planTransitions(diff, prev, next, mockLayout());

    expect(plan.transitions).toHaveLength(2);

    const lastTransition = plan.transitions[plan.transitions.length - 1]!;
    expect(plan.totalDurationMs).toBe(lastTransition.delayMs + lastTransition.durationMs);
  });
});

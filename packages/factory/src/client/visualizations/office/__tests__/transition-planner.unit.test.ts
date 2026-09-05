import { describe, expect, it } from 'vitest';

import { TRANSITION_STAGGER_MS } from '../constants/dimensions.ts';
import { createOfficeLayout } from '../layout/office-layout.ts';
import { planTransitions } from '../transitions/transition-planner.ts';
import type { OfficeDiff, Position, ResolvedPositions } from '../types.ts';

const layout = createOfficeLayout();

/** Build a minimal OfficeDiff with no changes. */
function emptyDiff(): OfficeDiff {
  return {
    orchestrator: {
      moved: null,
      statusChanged: null,
      waitingChanged: null,
      carriedChanged: null,
      codeBadgeChanged: null,
    },
    agents: [],
    artifacts: { added: [], removed: [], statusChanged: [] },
    zones: [],
    hasChanges: false,
  };
}

/** Build minimal ResolvedPositions. */
function positions(overrides: Partial<ResolvedPositions> = {}): ResolvedPositions {
  return {
    agents: new Map(),
    artifacts: new Map(),
    orchestrator: { x: 0, y: 0 },
    ...overrides,
  };
}

describe(planTransitions, () => {
  it('produces no transitions for an empty diff', () => {
    const result = planTransitions(emptyDiff(), positions(), positions(), layout);
    expect(result.transitions).toHaveLength(0);
  });

  it('produces a walk transition for orchestrator zone change', () => {
    const diff: OfficeDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        moved: { fromZone: 'governor', fromSlot: 'governor-desk-0', toZone: 'workshop', toSlot: 'workshop-standing-0' },
      },
      hasChanges: true,
    };

    const prevPos = positions({ orchestrator: layout.slotPosition('governor-desk-0') });
    const nextPos = positions({ orchestrator: layout.slotPosition('workshop-standing-0') });

    const result = planTransitions(diff, prevPos, nextPos, layout);
    const walk = result.transitions.find((t) => t.type === 'walk' && t.entityId === 'orchestrator');

    expect(walk).toBeDefined();
    expect(walk?.entityKind).toBe('orchestrator');
    expect(walk?.waypoints?.length).toBeGreaterThan(2); // corridor waypoints included
  });

  it('produces a state_change transition for orchestrator status change', () => {
    const diff: OfficeDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        statusChanged: { from: 'idle', to: 'dispatching' },
      },
      hasChanges: true,
    };

    const result = planTransitions(diff, positions(), positions(), layout);
    const stateChange = result.transitions.find((t) => t.type === 'state_change' && t.entityId === 'orchestrator');

    expect(stateChange).toBeDefined();
    expect(stateChange?.from).toBe('idle');
    expect(stateChange?.to).toBe('dispatching');
  });

  it('produces walk transitions with corridor waypoints for agent cross-zone movement', () => {
    const fromPos: Position = layout.slotPosition('prep-desk-0');
    const toPos: Position = layout.slotPosition('workshop-desk-0');

    const diff: OfficeDiff = {
      ...emptyDiff(),
      agents: [
        {
          agentId: 'a1',
          statusChanged: null,
          moved: { fromZone: 'prep', fromSlot: 'prep-desk-0', toZone: 'workshop', toSlot: 'workshop-desk-0' },
        },
      ],
      hasChanges: true,
    };

    const prevPos = positions({ agents: new Map([['a1', fromPos]]) });
    const nextPos = positions({ agents: new Map([['a1', toPos]]) });

    const result = planTransitions(diff, prevPos, nextPos, layout);
    const walk = result.transitions.find((t) => t.type === 'walk' && t.entityId === 'a1');

    expect(walk).toBeDefined();
    // Cross-zone: start + corridor waypoints + end > 2 points
    expect(walk?.waypoints?.length).toBeGreaterThan(2);
  });

  it('produces state_change transitions for agent status changes', () => {
    const diff: OfficeDiff = {
      ...emptyDiff(),
      agents: [
        {
          agentId: 'a1',
          statusChanged: { from: 'idle', to: 'working' },
          moved: null,
        },
      ],
      hasChanges: true,
    };

    const result = planTransitions(diff, positions(), positions(), layout);
    const stateChange = result.transitions.find((t) => t.type === 'state_change' && t.entityId === 'a1');

    expect(stateChange).toBeDefined();
    expect(stateChange?.from).toBe('idle');
    expect(stateChange?.to).toBe('working');
  });

  it('staggers transitions by the configured delay', () => {
    const diff: OfficeDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        moved: { fromZone: 'governor', fromSlot: 'governor-desk-0', toZone: 'prep', toSlot: 'prep-standing-0' },
        statusChanged: { from: 'idle', to: 'dispatching' },
      },
      hasChanges: true,
    };

    const prevPos = positions({ orchestrator: layout.slotPosition('governor-desk-0') });
    const nextPos = positions({ orchestrator: layout.slotPosition('prep-standing-0') });

    const result = planTransitions(diff, prevPos, nextPos, layout);

    expect(result.transitions.length).toBeGreaterThanOrEqual(2);
    const first = result.transitions[0];
    const second = result.transitions[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.delayMs).toBe(0);
    expect(second?.delayMs).toBe(TRANSITION_STAGGER_MS);
  });

  it('produces fade_in for newly added agents', () => {
    const toPos: Position = layout.slotPosition('workshop-desk-0');

    const diff: OfficeDiff = {
      ...emptyDiff(),
      agents: [
        {
          agentId: 'new-agent',
          statusChanged: null,
          moved: { fromZone: '', fromSlot: '', toZone: 'workshop', toSlot: 'workshop-desk-0' },
        },
      ],
      hasChanges: true,
    };

    const nextPos = positions({ agents: new Map([['new-agent', toPos]]) });
    const result = planTransitions(diff, positions(), nextPos, layout);

    const fadeIn = result.transitions.find((t) => t.type === 'fade_in' && t.entityId === 'new-agent');
    expect(fadeIn).toBeDefined();
  });

  it('produces artifact_appear for newly added artifacts', () => {
    const artPos: Position = layout.slotPosition('governor-storage-0');

    const diff: OfficeDiff = {
      ...emptyDiff(),
      artifacts: {
        added: [
          {
            id: 'art1',
            label: 'test',
            color: '#ff0000',
            status: 'created',
            producerPhase: 'implementation',
            zoneId: 'governor',
            slotId: 'governor-storage-0',
          },
        ],
        removed: [],
        statusChanged: [],
      },
      hasChanges: true,
    };

    const nextPos = positions({ artifacts: new Map([['art1', artPos]]) });
    const result = planTransitions(diff, positions(), nextPos, layout);

    const appear = result.transitions.find((t) => t.type === 'artifact_appear' && t.entityId === 'art1');
    expect(appear).toBeDefined();
  });

  it('deduplicates coincident waypoints for orchestrator walk from standing slot', () => {
    // When the orchestrator starts at prep-standing-0 (the door tile), the first corridor
    // waypoint is the same pixel position. The planner must deduplicate them.
    const prepStandingPos = layout.slotPosition('prep-standing-0');
    const governorDeskPos = layout.slotPosition('governor-desk-0');

    const diff: OfficeDiff = {
      ...emptyDiff(),
      orchestrator: {
        ...emptyDiff().orchestrator,
        moved: { fromZone: 'prep', fromSlot: 'prep-standing-0', toZone: 'governor', toSlot: 'governor-desk-0' },
      },
      hasChanges: true,
    };

    const prevPos = positions({ orchestrator: prepStandingPos });
    const nextPos = positions({ orchestrator: governorDeskPos });

    const result = planTransitions(diff, prevPos, nextPos, layout);
    const walk = result.transitions.find((t) => t.type === 'walk' && t.entityId === 'orchestrator');

    expect(walk).toBeDefined();
    const waypoints = walk?.waypoints ?? [];

    // Verify no consecutive coincident points
    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      if (prev === undefined || curr === undefined) continue;
      expect(prev.x === curr.x && prev.y === curr.y).toBe(false);
    }
  });

  it('preserves non-coincident waypoints unchanged', () => {
    const fromPos: Position = layout.slotPosition('prep-desk-0');
    const toPos: Position = layout.slotPosition('workshop-desk-0');

    const diff: OfficeDiff = {
      ...emptyDiff(),
      agents: [
        {
          agentId: 'a1',
          statusChanged: null,
          moved: { fromZone: 'prep', fromSlot: 'prep-desk-0', toZone: 'workshop', toSlot: 'workshop-desk-0' },
        },
      ],
      hasChanges: true,
    };

    const prevPos = positions({ agents: new Map([['a1', fromPos]]) });
    const nextPos = positions({ agents: new Map([['a1', toPos]]) });

    const result = planTransitions(diff, prevPos, nextPos, layout);
    const walk = result.transitions.find((t) => t.type === 'walk' && t.entityId === 'a1');

    expect(walk).toBeDefined();
    const waypoints = walk?.waypoints ?? [];

    // All waypoints should be unique consecutive points (start is inside the room, not at the door)
    for (let i = 1; i < waypoints.length; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      if (prev === undefined || curr === undefined) continue;
      expect(prev.x === curr.x && prev.y === curr.y).toBe(false);
    }
  });

  it('produces artifact_deliver for artifacts transitioning to delivered', () => {
    const diff: OfficeDiff = {
      ...emptyDiff(),
      artifacts: {
        added: [],
        removed: [],
        statusChanged: [{ artifactId: 'art1', from: 'created', to: 'delivered' }],
      },
      hasChanges: true,
    };

    const result = planTransitions(diff, positions(), positions(), layout);
    const deliver = result.transitions.find((t) => t.type === 'artifact_deliver' && t.entityId === 'art1');
    expect(deliver).toBeDefined();
    expect(deliver?.from).toBe('created');
    expect(deliver?.to).toBe('delivered');
  });
});

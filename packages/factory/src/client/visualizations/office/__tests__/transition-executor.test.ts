import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Excalibur before importing executor
vi.mock('excalibur', () => {
  return {
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { computeDirection, executeTransitions } = await import('../transitions/transition-executor.js');
const { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP } = await import('../sprites/sprite-definitions.js');

import type { TransitionContext } from '../transitions/transition-executor.js';
import type { FacilityLayout, OfficeSceneConfig, Position, TransitionPlan } from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Create a mock actor with chainable actions. */
function createMockActor() {
  const actions = {
    moveTo: vi.fn().mockReturnThis(),
    fade: vi.fn().mockReturnThis(),
    scaleTo: vi.fn().mockReturnThis(),
    callMethod: vi.fn().mockImplementation(function (this: unknown, fn?: () => void) {
      if (fn !== undefined) fn();
      return actions;
    }),
    clearActions: vi.fn(),
  };

  return {
    pos: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    graphics: { opacity: 1, use: vi.fn() },
    actions,
  };
}

/** Build a minimal TransitionContext for testing. */
function buildContext(overrides: Partial<TransitionContext> = {}): TransitionContext {
  const mockLayout: FacilityLayout = {
    slotPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    zoneCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    slotsInZone: vi.fn().mockReturnValue([]),
    corridorPath: vi.fn().mockReturnValue([]),
    slotDefinition: vi.fn().mockReturnValue(undefined),
    zones: [],
  };

  const config: OfficeSceneConfig = {
    orchestrator: {
      status: 'idle',
      carriedArtifacts: [],
      codeBadge: null,
      waiting: false,
      zoneId: 'governor',
      slotId: 'governor-desk-0',
    },
    agents: [],
    artifacts: [],
    zones: [],
  };

  return {
    findActor: vi.fn().mockReturnValue(undefined),
    createAgent: vi.fn().mockReturnValue(createMockActor()),
    createArtifact: vi.fn().mockReturnValue(createMockActor()),
    createOrchestrator: vi.fn().mockReturnValue(createMockActor()),
    removeActor: vi.fn(),
    updateSprite: vi.fn(),
    config,
    nextPositions: { agents: new Map(), artifacts: new Map(), orchestrator: { x: 0, y: 0 } },
    layout: mockLayout,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeDirection
// ---------------------------------------------------------------------------

describe(computeDirection, () => {
  it('returns DIR_DOWN when moving south', () => {
    expect(computeDirection({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(DIR_DOWN);
  });

  it('returns DIR_UP when moving north', () => {
    expect(computeDirection({ x: 0, y: 10 }, { x: 0, y: 0 })).toBe(DIR_UP);
  });

  it('returns DIR_RIGHT when moving east', () => {
    expect(computeDirection({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(DIR_RIGHT);
  });

  it('returns DIR_LEFT when moving west', () => {
    expect(computeDirection({ x: 10, y: 0 }, { x: 0, y: 0 })).toBe(DIR_LEFT);
  });

  it('favors vertical on tie (returns DIR_DOWN for equal positive dx/dy)', () => {
    expect(computeDirection({ x: 0, y: 0 }, { x: 5, y: 5 })).toBe(DIR_DOWN);
  });

  it('returns DIR_DOWN when from equals to', () => {
    expect(computeDirection({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(DIR_DOWN);
  });
});

// ---------------------------------------------------------------------------
// executeTransitions — dispatch by type
// ---------------------------------------------------------------------------

describe(executeTransitions, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispatches walk transitions with moveTo calls', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    // 2 segments = 2 moveTo calls + 2 direction callMethods + 1 resting callMethod
    expect(actor.actions.moveTo).toHaveBeenCalledTimes(2);
  });

  it('dispatches fade_in transitions and creates actor', () => {
    const mockActor = createMockActor();
    const createAgent = vi.fn().mockReturnValue(mockActor);
    const context = buildContext({
      createAgent,
      config: {
        orchestrator: {
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'governor',
          slotId: 'governor-desk-0',
        },
        agents: [
          {
            id: 'agent-1',
            role: 'coder',
            roleType: 'author',
            phase: 'implementation',
            status: 'working',
            zoneId: 'workshop',
            slotId: 'workshop-desk-0',
          },
        ],
        artifacts: [],
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'fade_in',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [{ x: 50, y: 50 }],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(createAgent).toHaveBeenCalledWith('agent-1', { x: 50, y: 50 }, 'implementation');
    expect(mockActor.graphics.opacity).toBe(0);
    expect(mockActor.actions.fade).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('dispatches fade_in for orchestrator entity kind', () => {
    const mockActor = createMockActor();
    const createOrchestrator = vi.fn().mockReturnValue(mockActor);
    const context = buildContext({ createOrchestrator });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'fade_in',
          entityId: 'orchestrator',
          entityKind: 'orchestrator',
          delayMs: 0,
          waypoints: [{ x: 100, y: 200 }],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(createOrchestrator).toHaveBeenCalledWith({ x: 100, y: 200 });
    expect(mockActor.graphics.opacity).toBe(0);
    expect(mockActor.actions.fade).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('dispatches fade_out transitions and removes actor', () => {
    const actor = createMockActor();
    const removeActor = vi.fn();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      removeActor,
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'fade_out',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [{ x: 50, y: 50 }],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(actor.actions.fade).toHaveBeenCalledWith(0, expect.any(Number));
    // callMethod invoked removeActor synchronously in the mock
    expect(removeActor).toHaveBeenCalledWith('agent-1', 'agent');
  });

  it('dispatches state_change transitions with pulse animation', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'state_change',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          from: 'idle',
          to: 'active',
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    // Two fade calls: dim then restore
    expect(actor.actions.fade).toHaveBeenCalledTimes(2);
    expect(actor.actions.fade).toHaveBeenNthCalledWith(1, 0.5, expect.any(Number));
    expect(actor.actions.fade).toHaveBeenNthCalledWith(2, 1, expect.any(Number));
  });

  it('dispatches artifact_appear transitions with scale animation', () => {
    const mockActor = createMockActor();
    const createArtifact = vi.fn().mockReturnValue(mockActor);
    const context = buildContext({
      createArtifact,
      config: {
        orchestrator: {
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'governor',
          slotId: 'governor-desk-0',
        },
        agents: [],
        artifacts: [
          {
            id: 'artifact-1',
            label: 'plan',
            color: '#ff0000',
            status: 'created',
            producerPhase: 'planning',
            zoneId: 'workshop',
            slotId: 'workshop-desk-0',
          },
        ],
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'artifact_appear',
          entityId: 'artifact-1',
          entityKind: 'artifact',
          delayMs: 0,
          waypoints: [{ x: 200, y: 100 }],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(createArtifact).toHaveBeenCalledWith('artifact-1', { x: 200, y: 100 }, '#ff0000');
    expect(mockActor.scale).toEqual({ x: 0, y: 0 });
    expect(mockActor.actions.scaleTo).toHaveBeenCalledTimes(2);
  });

  it('dispatches artifact_deliver transitions with moveTo', () => {
    const actor = createMockActor();
    const deliveryPos: Position = { x: 300, y: 150 };
    const artifactPositions = new Map<string, Position>([['artifact-1', deliveryPos]]);

    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      nextPositions: { agents: new Map(), artifacts: artifactPositions, orchestrator: { x: 0, y: 0 } },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'artifact_deliver',
          entityId: 'artifact-1',
          entityKind: 'artifact',
          delayMs: 0,
          from: 'available',
          to: 'delivered',
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(actor.actions.moveTo).toHaveBeenCalledWith({ x: 300, y: 150 }, expect.any(Number));
  });

  // ---------------------------------------------------------------------------
  // Edge cases — silent early returns
  // ---------------------------------------------------------------------------

  it('does nothing for walk transition with fewer than 2 waypoints', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [{ x: 0, y: 0 }],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(actor.actions.moveTo).not.toHaveBeenCalled();
  });

  it('does nothing for artifact_deliver with missing target position', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      nextPositions: { agents: new Map(), artifacts: new Map(), orchestrator: { x: 0, y: 0 } },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'artifact_deliver',
          entityId: 'artifact-missing',
          entityKind: 'artifact',
          delayMs: 0,
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(actor.actions.moveTo).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Stagger timing
  // ---------------------------------------------------------------------------

  it('respects delayMs stagger timing', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
    });

    const plan: TransitionPlan = {
      transitions: [
        { type: 'state_change', entityId: 'a1', entityKind: 'agent', delayMs: 0 },
        { type: 'state_change', entityId: 'a2', entityKind: 'agent', delayMs: 150 },
        { type: 'state_change', entityId: 'a3', entityKind: 'agent', delayMs: 300 },
      ],
    };

    executeTransitions(plan, context);

    // At t=0, only the first transition should have fired
    vi.advanceTimersByTime(0);
    expect(actor.actions.fade).toHaveBeenCalledTimes(2); // 1 pulse = 2 fades

    // At t=150, second transition fires
    vi.advanceTimersByTime(150);
    expect(actor.actions.fade).toHaveBeenCalledTimes(4);

    // At t=300, third transition fires
    vi.advanceTimersByTime(150);
    expect(actor.actions.fade).toHaveBeenCalledTimes(6);
  });

  // ---------------------------------------------------------------------------
  // Cancel behavior
  // ---------------------------------------------------------------------------

  it('cancel clears pending timers and actions', () => {
    const actor = createMockActor();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
    });

    const plan: TransitionPlan = {
      transitions: [
        { type: 'state_change', entityId: 'a1', entityKind: 'agent', delayMs: 0 },
        { type: 'state_change', entityId: 'a2', entityKind: 'agent', delayMs: 500 },
      ],
    };

    const handle = executeTransitions(plan, context);

    // Fire the first transition
    vi.advanceTimersByTime(0);
    expect(actor.actions.fade).toHaveBeenCalledTimes(2);

    // Cancel before the second fires
    handle.cancel();
    expect(actor.actions.clearActions).toHaveBeenCalled();

    // Advance past the second transition's delay — should not fire
    vi.advanceTimersByTime(600);
    expect(actor.actions.fade).toHaveBeenCalledTimes(2);
  });

  it('cancel clears actions on actors created by fade_in transitions', () => {
    const createdActor = createMockActor();
    const createAgent = vi.fn().mockReturnValue(createdActor);
    const context = buildContext({
      findActor: vi.fn().mockImplementation((id: string) => {
        // After creation, findActor resolves the new actor
        if (id === 'new-agent') return createdActor;
        return undefined;
      }),
      createAgent,
      config: {
        orchestrator: {
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'governor',
          slotId: 'governor-desk-0',
        },
        agents: [
          {
            id: 'new-agent',
            role: 'coder',
            roleType: 'author',
            phase: 'implementation',
            status: 'working',
            zoneId: 'workshop',
            slotId: 'workshop-desk-0',
          },
        ],
        artifacts: [],
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'fade_in',
          entityId: 'new-agent',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [{ x: 50, y: 50 }],
        },
        { type: 'state_change', entityId: 'new-agent', entityKind: 'agent', delayMs: 500 },
      ],
    };

    const handle = executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    expect(createAgent).toHaveBeenCalled();

    handle.cancel();
    expect(createdActor.actions.clearActions).toHaveBeenCalled();

    // Second transition should not fire
    vi.advanceTimersByTime(600);
    expect(createdActor.actions.fade).toHaveBeenCalledTimes(1); // Only the initial fade_in
  });

  // ---------------------------------------------------------------------------
  // Resting direction resolution
  // ---------------------------------------------------------------------------

  it('sets resting direction to DIR_DOWN for orchestrator after walk', () => {
    const actor = createMockActor();
    const updateSprite = vi.fn();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      updateSprite,
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'orchestrator',
          entityKind: 'orchestrator',
          delayMs: 0,
          waypoints: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    // Last updateSprite call is the resting direction
    const lastCall = updateSprite.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.[3]).toBe(DIR_DOWN);
  });

  it('resolves orchestrator resting direction from slot facing metadata', () => {
    const actor = createMockActor();
    const updateSprite = vi.fn();
    const slotDefinition = vi
      .fn()
      .mockReturnValue({ id: 'prep-standing-0', type: 'standing', tile: { col: 6, row: 12 }, facing: 'up' });

    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      updateSprite,
      config: {
        orchestrator: {
          status: 'dispatching',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'prep',
          slotId: 'prep-standing-0',
        },
        agents: [],
        artifacts: [],
        zones: [],
      },
      layout: {
        slotPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        zoneCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        slotsInZone: vi.fn().mockReturnValue([]),
        corridorPath: vi.fn().mockReturnValue([]),
        slotDefinition,
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'orchestrator',
          entityKind: 'orchestrator',
          delayMs: 0,
          waypoints: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    // The slot has facing: 'up', so resting direction should be DIR_UP
    const lastCall = updateSprite.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.[3]).toBe(DIR_UP);
    expect(slotDefinition).toHaveBeenCalledWith('prep-standing-0');
  });

  it('uses DIR_UP as fallback resting direction when agent is absent from config', () => {
    const actor = createMockActor();
    const updateSprite = vi.fn();
    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      updateSprite,
      config: {
        orchestrator: {
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'governor',
          slotId: 'governor-desk-0',
        },
        agents: [], // agent-1 intentionally absent
        artifacts: [],
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    const lastCall = updateSprite.mock.calls.at(-1);
    expect(lastCall?.[3]).toBe(DIR_UP);
  });

  it('resolves agent resting direction from slot facing metadata', () => {
    const actor = createMockActor();
    const updateSprite = vi.fn();
    const slotDefinition = vi
      .fn()
      .mockReturnValue({ id: 'workshop-desk-1', type: 'workstation', tile: { col: 21, row: 7 }, facing: 'down' });

    const context = buildContext({
      findActor: vi.fn().mockReturnValue(actor),
      updateSprite,
      config: {
        orchestrator: {
          status: 'idle',
          carriedArtifacts: [],
          codeBadge: null,
          waiting: false,
          zoneId: 'governor',
          slotId: 'governor-desk-0',
        },
        agents: [
          {
            id: 'agent-1',
            role: 'reviewer',
            roleType: 'reviewer',
            phase: 'review',
            status: 'working',
            zoneId: 'workshop',
            slotId: 'workshop-desk-1',
          },
        ],
        artifacts: [],
        zones: [],
      },
      layout: {
        slotPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        zoneCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }),
        slotsInZone: vi.fn().mockReturnValue([]),
        corridorPath: vi.fn().mockReturnValue([]),
        slotDefinition,
        zones: [],
      },
    });

    const plan: TransitionPlan = {
      transitions: [
        {
          type: 'walk',
          entityId: 'agent-1',
          entityKind: 'agent',
          delayMs: 0,
          waypoints: [
            { x: 0, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    executeTransitions(plan, context);
    vi.advanceTimersByTime(0);

    // Last updateSprite call should be the resting direction from slot.facing
    const lastCall = updateSprite.mock.calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.[3]).toBe(DIR_DOWN);
    expect(slotDefinition).toHaveBeenCalledWith('workshop-desk-1');
  });
});

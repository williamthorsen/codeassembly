import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsUse, mockGetAnimation } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
    mockGetAnimation: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    scale = { x: 1, y: 1 };
    graphics = { use: mockGraphicsUse, opacity: 1, isVisible: true, scale: { x: 1, y: 1 } };
    pos = { x: 0, y: 0 };
    actions = {
      moveTo: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
      fade: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
      scaleTo: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
      clearActions: vi.fn(),
    };
    constructor(config: Record<string, unknown>) {
      mockActorConstructor(config);
      this.config = config;
    }
  }

  class MockColor {
    hex: string;
    constructor(hex: string) {
      this.hex = hex;
    }
    static fromHex(hex: string) {
      return new MockColor(hex);
    }
  }

  class MockRectangle {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockFont {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockText {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockGraphicsGroup {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  const MockTextAlign = { Center: 'center', Left: 'left' };
  const MockBaseAlign = { Middle: 'middle', Top: 'top' };
  const MockAnimationStrategy = { PingPong: 'ping-pong', Loop: 'loop', Freeze: 'freeze' };

  return {
    Actor: MockActor,
    Color: MockColor,
    Rectangle: MockRectangle,
    Text: MockText,
    Font: MockFont,
    GraphicsGroup: MockGraphicsGroup,
    TextAlign: MockTextAlign,
    BaseAlign: MockBaseAlign,
    AnimationStrategy: MockAnimationStrategy,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

vi.mock('../../sprites/catwalk-sprite-loader.js', () => ({
  getAnimation: mockGetAnimation,
}));

const { OrchestratorActor } = await import('../OrchestratorActor.js');
const { StationAgentActor } = await import('../StationAgentActor.js');
const { CatwalkStationActor } = await import('../CatwalkStationActor.js');
const { ArtifactActor } = await import('../ArtifactActor.js');
const { GateActor } = await import('../GateActor.js');
const { ChuteActor } = await import('../ChuteActor.js');
const { vec } = await import('excalibur');
const {
  ACTIVE_OPACITY,
  CHUTE_DIMMED_OPACITY,
  CHUTE_OPACITY,
  DEACTIVATED_OPACITY,
  GATE_OPACITY,
  IDLE_OPACITY,
  ORCH_IDLE_OPACITY,
  RESTING_OPACITY,
} = await import('../../constants/animation.js');

describe('OrchestratorActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
    mockGetAnimation.mockClear();
    mockGetAnimation.mockReturnValue({ type: 'animation' });
  });

  it('sets opacity to ACTIVE_OPACITY when working is true', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('sets opacity to ORCH_IDLE_OPACITY when working is false', () => {
    const actor = new OrchestratorActor({ working: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ORCH_IDLE_OPACITY);
  });

  it('animateMoveTo calls actions.moveTo with position and walk speed', () => {
    const actor = new OrchestratorActor({ working: false }, vec(0, 100));
    actor.animateMoveTo(vec(200, 100));

    expect(actor.actions.moveTo).toHaveBeenCalledWith(expect.objectContaining({ x: 200, y: 100 }), expect.any(Number));
  });

  it('setWorking(true) enables pulse flag and restores full opacity', () => {
    const actor = new OrchestratorActor({ working: false }, vec(0, 0));
    expect(actor.graphics.opacity).toBe(ORCH_IDLE_OPACITY);

    actor.setWorking(true);

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);

    // Simulate onPreUpdate — scale should pulse within range
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Engine param unused in test mock
    actor.onPreUpdate(undefined as never, 500);
    expect(actor.scale.x).toBeGreaterThanOrEqual(1);
    expect(actor.scale.x).toBeLessThanOrEqual(1.08);
    expect(actor.scale.y).toBe(actor.scale.x);
  });

  it('setWorking(false) disables pulse and sets idle opacity', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));
    actor.setWorking(false);

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Engine param unused in test mock
    actor.onPreUpdate(undefined as never, 0);
    expect(actor.graphics.opacity).toBe(ORCH_IDLE_OPACITY);
    expect(actor.scale).toEqual({ x: 1, y: 1 });
  });

  it('calls getAnimation with orchestrator type and working state', () => {
    new OrchestratorActor({ working: true }, vec(0, 0));

    expect(mockGetAnimation).toHaveBeenCalledWith('orchestrator', 'working');
  });

  it('calls getAnimation with orchestrator type and idle state when not working', () => {
    new OrchestratorActor({ working: false }, vec(0, 0));

    expect(mockGetAnimation).toHaveBeenCalledWith('orchestrator', 'idle');
  });

  it('setWorking calls graphics.use to update the sprite', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));
    mockGraphicsUse.mockClear();

    actor.setWorking(false);

    expect(mockGraphicsUse).toHaveBeenCalled();
  });

  it('setWorking(false) calls getAnimation with idle state', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));
    mockGetAnimation.mockClear();

    actor.setWorking(false);

    expect(mockGetAnimation).toHaveBeenCalledWith('orchestrator', 'idle');
  });

  it('setWorking(true) calls getAnimation with working state', () => {
    const actor = new OrchestratorActor({ working: false }, vec(0, 0));
    mockGetAnimation.mockClear();

    actor.setWorking(true);

    expect(mockGetAnimation).toHaveBeenCalledWith('orchestrator', 'working');
  });
});

describe('StationAgentActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
    mockGetAnimation.mockClear();
    mockGetAnimation.mockReturnValue({ type: 'animation' });
  });

  it('sets opacity to IDLE_OPACITY for idle state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(IDLE_OPACITY);
  });

  it('sets opacity to RESTING_OPACITY for resting state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'resting' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(RESTING_OPACITY);
  });

  it('sets opacity to ACTIVE_OPACITY for working state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('pulses scale when constructed with working state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Engine param unused in test mock
    actor.onPreUpdate(undefined as never, 500);
    expect(actor.scale.x).toBeGreaterThanOrEqual(1);
    expect(actor.scale.x).toBeLessThanOrEqual(1.08);
    expect(actor.scale.y).toBe(actor.scale.x);
  });

  it('sets opacity to ACTIVE_OPACITY for celebrating state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'celebrating' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('sets opacity to ACTIVE_OPACITY for concerned state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'concerned' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('sets opacity to ACTIVE_OPACITY for walking state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'walking' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('sets opacity to DEACTIVATED_OPACITY for deactivated state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'deactivated' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(DEACTIVATED_OPACITY);
  });

  it('animateToState fades to target opacity via actions.fade', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));
    actor.animateToState('resting');

    expect(actor.actions.fade).toHaveBeenCalledWith(RESTING_OPACITY, expect.any(Number));
  });

  it('animateToState enables pulse when transitioning to working', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));
    actor.animateToState('working');

    expect(actor.actions.fade).toHaveBeenCalledWith(ACTIVE_OPACITY, expect.any(Number));

    // Simulate onPreUpdate — scale should pulse within range
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Engine param unused in test mock
    actor.onPreUpdate(undefined as never, 500);
    expect(actor.scale.x).toBeGreaterThanOrEqual(1);
    expect(actor.scale.x).toBeLessThanOrEqual(1.08);
    expect(actor.scale.y).toBe(actor.scale.x);
  });

  it('animateToState disables pulse when leaving working', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));
    actor.animateToState('resting');

    expect(actor.actions.fade).toHaveBeenCalledWith(RESTING_OPACITY, expect.any(Number));
    expect(actor.scale).toEqual({ x: 1, y: 1 });

    // After leaving working, onPreUpdate should not change scale (pulse is disabled).
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Engine param unused in test mock
    actor.onPreUpdate(undefined as never, 500);
    expect(actor.scale).toEqual({ x: 1, y: 1 });
  });

  it('fadeIn sets opacity to 0 then fades to state-appropriate opacity', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'resting' }, vec(0, 0));
    actor.fadeIn();

    // Opacity should be synchronously set to 0 before fade is called
    expect(actor.graphics.opacity).toBe(0);
    expect(actor.actions.fade).toHaveBeenCalledWith(RESTING_OPACITY, expect.any(Number));
  });

  it('animateToState to deactivated fades to DEACTIVATED_OPACITY', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));
    actor.animateToState('deactivated');

    expect(actor.actions.fade).toHaveBeenCalledWith(DEACTIVATED_OPACITY, expect.any(Number));
  });

  it('calls getAnimation with subagent type and the given state', () => {
    new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));

    expect(mockGetAnimation).toHaveBeenCalledWith('subagent', 'working');
  });

  it('calls graphics.use with a GraphicsGroup on construction', () => {
    new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));

    expect(mockGraphicsUse).toHaveBeenCalledTimes(1);
  });

  it('animateToState calls graphics.use to re-render the sprite', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));
    mockGraphicsUse.mockClear();

    actor.animateToState('working');

    expect(mockGraphicsUse).toHaveBeenCalled();
  });

  it('applies the config color to the accent bar', () => {
    const color = '#FF00AA';
    new StationAgentActor({ id: 'a', role: 'arch', color, state: 'working' }, vec(0, 0));

    const call = mockGraphicsUse.mock.calls[0];
    if (!call) throw new TypeError('Expected graphics.use to have been called');

    // The GraphicsGroup is the first argument; verify the accent bar (second member) uses the config color
    expect(call[0]).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          members: expect.arrayContaining([
            expect.objectContaining({
              graphic: expect.objectContaining({
                options: expect.objectContaining({
                  color: expect.objectContaining({ hex: color }),
                }),
              }),
            }),
          ]),
        }),
      }),
    );
  });
});

describe('CatwalkStationActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to IDLE_OPACITY when absent is true', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(IDLE_OPACITY);
  });

  it('sets opacity to ACTIVE_OPACITY when absent is false', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });

  it('updateConfig toggles opacity', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: false }, vec(0, 0));
    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);

    actor.updateConfig({ phase: 'Architecture', color: '#5555FF', absent: true });
    expect(actor.graphics.opacity).toBe(IDLE_OPACITY);

    actor.updateConfig({ phase: 'Architecture', color: '#5555FF', absent: false });
    expect(actor.graphics.opacity).toBe(ACTIVE_OPACITY);
  });
});

describe('ArtifactActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('constructs without error', () => {
    expect(() => new ArtifactActor({ label: 'plan', color: '#AAFFAA' }, vec(0, 0))).not.toThrow();
  });

  it('calls graphics.use() with a GraphicsGroup containing a rect and a label member', () => {
    new ArtifactActor({ label: 'plan', color: '#AAFFAA' }, vec(0, 0));

    expect(mockGraphicsUse).toHaveBeenCalledTimes(1);

    const call = mockGraphicsUse.mock.calls[0];
    if (!call) {
      throw new TypeError('Expected graphics.use to have been called');
    }

    const group: unknown = call[0];
    expect(group).toEqual(
      expect.objectContaining({
        options: expect.objectContaining({
          members: [
            expect.objectContaining({ graphic: expect.anything(), offset: expect.anything() }),
            expect.objectContaining({ graphic: expect.anything(), offset: expect.anything() }),
          ],
        }),
      }),
    );
  });

  it('updateConfig can be called without error', () => {
    const actor = new ArtifactActor({ label: 'plan', color: '#AAFFAA' }, vec(0, 0));

    expect(() => actor.updateConfig({ label: 'updated', color: '#FF0000' })).not.toThrow();
  });

  it('fadeIn sets opacity to 0 then calls actions.fade to 1', () => {
    const actor = new ArtifactActor({ label: 'plan', color: '#AAFFAA' }, vec(0, 0));
    actor.fadeIn();

    // Opacity should be synchronously set to 0 before fade is called
    expect(actor.graphics.opacity).toBe(0);
    expect(actor.actions.fade).toHaveBeenCalledWith(ACTIVE_OPACITY, expect.any(Number));
  });
});

describe('GateActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to GATE_OPACITY and isVisible to true when open is false', () => {
    const actor = new GateActor({ open: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(GATE_OPACITY);
    expect(actor.graphics.isVisible).toBe(true);
  });

  it('sets isVisible to false when open is true', () => {
    const actor = new GateActor({ open: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(GATE_OPACITY);
    expect(actor.graphics.isVisible).toBe(false);
  });

  it('updateConfig toggles isVisible', () => {
    const actor = new GateActor({ open: false }, vec(0, 0));
    expect(actor.graphics.isVisible).toBe(true);

    actor.updateConfig({ open: true });
    expect(actor.graphics.isVisible).toBe(false);

    actor.updateConfig({ open: false });
    expect(actor.graphics.isVisible).toBe(true);
  });

  it('animateOpen scales Y to 0 via actions.scaleTo', () => {
    const actor = new GateActor({ open: false }, vec(100, 100));
    actor.animateOpen();

    expect(actor.actions.scaleTo).toHaveBeenCalledWith(
      expect.objectContaining({ x: 1, y: 0 }),
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
    );
  });
});

describe('ChuteActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
    mockActorConstructor.mockClear();
  });

  it('sets opacity to CHUTE_OPACITY when dimmed is false', () => {
    const actor = new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(actor.graphics.opacity).toBe(CHUTE_OPACITY);
  });

  it('sets opacity to CHUTE_DIMMED_OPACITY when dimmed is true', () => {
    const actor = new ChuteActor({ dimmed: true }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(actor.graphics.opacity).toBe(CHUTE_DIMMED_OPACITY);
  });

  it('updateConfig toggles opacity', () => {
    const actor = new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });
    expect(actor.graphics.opacity).toBe(CHUTE_OPACITY);

    actor.updateConfig({ dimmed: true });
    expect(actor.graphics.opacity).toBe(CHUTE_DIMMED_OPACITY);

    actor.updateConfig({ dimmed: false });
    expect(actor.graphics.opacity).toBe(CHUTE_OPACITY);
  });

  it('computes position as midpoint between top and bottom endpoints', () => {
    new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(mockActorConstructor).toHaveBeenCalledWith({
      pos: { x: 100, y: 234 },
    });
  });
});

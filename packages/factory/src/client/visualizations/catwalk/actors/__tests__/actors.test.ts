import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsUse } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: mockGraphicsUse, opacity: 1, isVisible: true };
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

  class MockCircle {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
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

  return {
    Actor: MockActor,
    Color: MockColor,
    Circle: MockCircle,
    Rectangle: MockRectangle,
    Text: MockText,
    Font: MockFont,
    GraphicsGroup: MockGraphicsGroup,
    TextAlign: MockTextAlign,
    BaseAlign: MockBaseAlign,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { OrchestratorActor } = await import('../OrchestratorActor.js');
const { StationAgentActor } = await import('../StationAgentActor.js');
const { CatwalkStationActor } = await import('../CatwalkStationActor.js');
const { ArtifactActor } = await import('../ArtifactActor.js');
const { GateActor } = await import('../GateActor.js');
const { ChuteActor } = await import('../ChuteActor.js');
const { vec } = await import('excalibur');

describe('OrchestratorActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to 1.0 when working is true', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('sets opacity to 0.8 when working is false', () => {
    const actor = new OrchestratorActor({ working: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.8);
  });

  it('updateConfig toggles opacity', () => {
    const actor = new OrchestratorActor({ working: true }, vec(0, 0));
    expect(actor.graphics.opacity).toBe(1);

    actor.updateConfig({ working: false });
    expect(actor.graphics.opacity).toBe(0.8);

    actor.updateConfig({ working: true });
    expect(actor.graphics.opacity).toBe(1);
  });
});

describe('StationAgentActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to 0.3 for idle state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.3);
  });

  it('sets opacity to 0.6 for resting state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'resting' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.6);
  });

  it('sets opacity to 1.0 for working state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('sets opacity to 1.0 for celebrating state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'celebrating' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('sets opacity to 1.0 for concerned state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'concerned' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('sets opacity to 1.0 for walking state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'walking' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('sets opacity to DEACTIVATED_OPACITY for deactivated state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'deactivated' }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.15);
  });

  it('updateConfig toggles opacity by state', () => {
    const actor = new StationAgentActor({ id: 'a', role: 'arch', color: '#5555FF', state: 'idle' }, vec(0, 0));
    expect(actor.graphics.opacity).toBe(0.3);

    actor.updateConfig({ id: 'a', role: 'arch', color: '#5555FF', state: 'working' });
    expect(actor.graphics.opacity).toBe(1);

    actor.updateConfig({ id: 'a', role: 'arch', color: '#5555FF', state: 'resting' });
    expect(actor.graphics.opacity).toBe(0.6);
  });
});

describe('CatwalkStationActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to 0.3 when absent is true', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.3);
  });

  it('sets opacity to 1.0 when absent is false', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(1);
  });

  it('updateConfig toggles opacity', () => {
    const actor = new CatwalkStationActor({ phase: 'Architecture', color: '#5555FF', absent: false }, vec(0, 0));
    expect(actor.graphics.opacity).toBe(1);

    actor.updateConfig({ phase: 'Architecture', color: '#5555FF', absent: true });
    expect(actor.graphics.opacity).toBe(0.3);

    actor.updateConfig({ phase: 'Architecture', color: '#5555FF', absent: false });
    expect(actor.graphics.opacity).toBe(1);
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
});

describe('GateActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
  });

  it('sets opacity to 0.85 and isVisible to true when open is false', () => {
    const actor = new GateActor({ open: false }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.85);
    expect(actor.graphics.isVisible).toBe(true);
  });

  it('sets isVisible to false when open is true', () => {
    const actor = new GateActor({ open: true }, vec(0, 0));

    expect(actor.graphics.opacity).toBe(0.85);
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
});

describe('ChuteActor', () => {
  beforeEach(() => {
    mockGraphicsUse.mockClear();
    mockActorConstructor.mockClear();
  });

  it('sets opacity to 0.5 when dimmed is false', () => {
    const actor = new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(actor.graphics.opacity).toBe(0.5);
  });

  it('sets opacity to 0.15 when dimmed is true', () => {
    const actor = new ChuteActor({ dimmed: true }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(actor.graphics.opacity).toBe(0.15);
  });

  it('updateConfig toggles opacity', () => {
    const actor = new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });
    expect(actor.graphics.opacity).toBe(0.5);

    actor.updateConfig({ dimmed: true });
    expect(actor.graphics.opacity).toBe(0.15);

    actor.updateConfig({ dimmed: false });
    expect(actor.graphics.opacity).toBe(0.5);
  });

  it('computes position as midpoint between top and bottom endpoints', () => {
    new ChuteActor({ dimmed: false }, { topX: 100, topY: 148, botX: 100, botY: 320 });

    expect(mockActorConstructor).toHaveBeenCalledWith({
      pos: { x: 100, y: 234 },
    });
  });
});

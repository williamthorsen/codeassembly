import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsUse, mockRectangleConstructor } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
    mockRectangleConstructor: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: mockGraphicsUse };
    pos = { x: 0, y: 0, clone: () => ({ x: 0, y: 0 }) };
    constructor(config: Record<string, unknown>) {
      mockActorConstructor(config);
      this.config = config;
      const pos = config.pos;
      if (typeof pos === 'object' && pos !== null && 'x' in pos && 'y' in pos) {
        const { x, y } = pos;
        const nx = typeof x === 'number' ? x : 0;
        const ny = typeof y === 'number' ? y : 0;
        this.pos = { x: nx, y: ny, clone: () => ({ x: nx, y: ny }) };
      }
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
    width: number;
    height: number;
    color: unknown;
    constructor(options: { width: number; height: number; color: unknown }) {
      mockRectangleConstructor(options);
      this.width = options.width;
      this.height = options.height;
      this.color = options.color;
    }
  }

  return {
    Actor: MockActor,
    Color: MockColor,
    Rectangle: MockRectangle,
    vec: (x: number, y: number) => ({ x, y, clone: () => ({ x, y }) }),
  };
});

const { GateActor, GATE_WIDTH_PX, GATE_BLOCKING_HEIGHT_PX, GATE_NONBLOCKING_HEIGHT_PX, GATE_TRANSITION_DURATION_MS } =
  await import('../GateActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

interface MockRect {
  width: number;
  height: number;
  color: unknown;
}

function isMockRect(value: unknown): value is MockRect {
  return typeof value === 'object' && value !== null && 'width' in value && 'height' in value && 'color' in value;
}

/** Get the Rectangle graphic passed to `graphics.use()` in the most recent call. */
function getUsedRect(): MockRect {
  const lastCall: unknown[] | undefined = mockGraphicsUse.mock.lastCall;
  if (lastCall === undefined) throw new Error('graphics.use() was never called');
  const arg: unknown = lastCall[0];
  if (!isMockRect(arg)) throw new Error('Unexpected argument to graphics.use()');
  return arg;
}

/** Linear interpolation between two values. */
function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

const POSITION_Y = 370;
const platformSurfaceY = POSITION_Y + GATE_BLOCKING_HEIGHT_PX / 2;

describe('GateActor', () => {
  beforeEach(() => {
    mockActorConstructor.mockClear();
    mockGraphicsUse.mockClear();
    mockRectangleConstructor.mockClear();
  });

  describe('constructor', () => {
    it('creates a rectangle with green color and nonblocking height when open', () => {
      new GateActor(true, vec(100, POSITION_Y));

      expect(mockRectangleConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          width: GATE_WIDTH_PX,
          height: GATE_NONBLOCKING_HEIGHT_PX,
          color: Color.fromHex(PALETTE.green),
        }),
      );
    });

    it('creates a rectangle with red color and blocking height when closed', () => {
      new GateActor(false, vec(100, POSITION_Y));

      expect(mockRectangleConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          width: GATE_WIDTH_PX,
          height: GATE_BLOCKING_HEIGHT_PX,
          color: Color.fromHex(PALETTE.red),
        }),
      );
    });

    it('uses the rectangle graphic via graphics.use()', () => {
      new GateActor(true, vec(100, POSITION_Y));

      expect(mockGraphicsUse).toHaveBeenCalled();
    });

    it('pins bottom edge of open gate to platform surface', () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));

      expect(gate.pos.y).toBe(platformSurfaceY - GATE_NONBLOCKING_HEIGHT_PX / 2);
    });

    it('pins bottom edge of closed gate to platform surface', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      expect(gate.pos.y).toBe(platformSurfaceY - GATE_BLOCKING_HEIGHT_PX / 2);
    });

    it('passes only width (not height or color) to the Actor constructor', () => {
      new GateActor(true, vec(100, POSITION_Y));

      expect(mockActorConstructor).toHaveBeenCalledWith(expect.objectContaining({ width: GATE_WIDTH_PX }));
      expect(mockActorConstructor).toHaveBeenCalledWith(expect.not.objectContaining({ height: expect.anything() }));
      expect(mockActorConstructor).toHaveBeenCalledWith(expect.not.objectContaining({ color: expect.anything() }));
    });
  });

  describe('setOpen', () => {
    it('changes color to green when opening a closed gate', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));
      const rect = getUsedRect();

      gate.setOpen(true);

      expect(rect.color).toEqual(Color.fromHex(PALETTE.green));
    });

    it('changes color to red when closing an open gate', () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));
      const rect = getUsedRect();

      gate.setOpen(false);

      expect(rect.color).toEqual(Color.fromHex(PALETTE.red));
    });

    it('is a no-op when setting same state', () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));
      const rect = getUsedRect();
      const colorBefore = rect.color;

      gate.setOpen(true);

      expect(rect.color).toBe(colorBefore);
    });

    it('starts animation when state changes (waitForOpen returns pending promise)', async () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);

      // waitForOpen should not resolve immediately because animation is in progress
      let resolved = false;
      void gate.waitForOpen().then(() => {
        resolved = true;
        return undefined;
      });

      // Drain microtasks
      await Promise.resolve();
      expect(resolved).toBe(false);
    });

    it('uses current interpolated height as startHeight when reversing direction mid-animation', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));
      const rect = getUsedRect();

      gate.setOpen(true);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);
      const midHeight = lerp(GATE_BLOCKING_HEIGHT_PX, GATE_NONBLOCKING_HEIGHT_PX, 0.5);
      expect(rect.height).toBe(midHeight);

      // Reverse direction: close the gate mid-animation
      gate.setOpen(false);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);
      expect(rect.height).toBe(lerp(midHeight, GATE_BLOCKING_HEIGHT_PX, 0.5));

      // Complete new animation: height should reach blocking height
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);
      expect(rect.height).toBe(GATE_BLOCKING_HEIGHT_PX);
    });

    it('flushes pending waitForOpen resolvers when direction reverses to closed', async () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);
      const promise = gate.waitForOpen();

      // Advance partway through opening animation
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, 300);

      // Reverse direction: close the gate
      gate.setOpen(false);

      // Complete the closing animation
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS);

      // Resolver should be flushed to prevent the caller from hanging
      await expect(promise).resolves.toBeUndefined();
    });

    it('maintains consistent pos.y throughout mid-animation reversal', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);
      const midHeight = lerp(GATE_BLOCKING_HEIGHT_PX, GATE_NONBLOCKING_HEIGHT_PX, 0.5);
      expect(gate.pos.y).toBe(platformSurfaceY - midHeight / 2);

      // Reverse direction
      gate.setOpen(false);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);
      const reversedMidHeight = lerp(midHeight, GATE_BLOCKING_HEIGHT_PX, 0.5);
      expect(gate.pos.y).toBe(platformSurfaceY - reversedMidHeight / 2);
    });
  });

  describe('onPreUpdate', () => {
    it('interpolates height to halfway at half of transition duration', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));
      const rect = getUsedRect();

      gate.setOpen(true);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);

      expect(rect.height).toBe(lerp(GATE_BLOCKING_HEIGHT_PX, GATE_NONBLOCKING_HEIGHT_PX, 0.5));
    });

    it('reaches target height when elapsed exceeds transition duration', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));
      const rect = getUsedRect();

      gate.setOpen(true);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS * 1.2);

      expect(rect.height).toBe(GATE_NONBLOCKING_HEIGHT_PX);
    });

    it('updates pos.y to keep bottom edge pinned during animation', () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS / 2);

      const midHeight = lerp(GATE_BLOCKING_HEIGHT_PX, GATE_NONBLOCKING_HEIGHT_PX, 0.5);
      expect(gate.pos.y).toBe(platformSurfaceY - midHeight / 2);
    });

    it('does nothing when no animation is in progress', () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));
      const yBefore = gate.pos.y;

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, 100);

      expect(gate.pos.y).toBe(yBefore);
    });

    it('resolves waitForOpen promises when animation completes toward open', async () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);
      const promise = gate.waitForOpen();

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS);

      await expect(promise).resolves.toBeUndefined();
    });

    it('resolves waitForOpen promises when animation completes toward closed', async () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));

      gate.setOpen(false);
      const promise = gate.waitForOpen();

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS);

      // Resolvers are flushed to prevent permanently blocking callers
      await expect(promise).resolves.toBeUndefined();
    });

    it('resolves all concurrent waitForOpen callers when animation completes', async () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      gate.setOpen(true);
      const promise1 = gate.waitForOpen();
      const promise2 = gate.waitForOpen();
      const promise3 = gate.waitForOpen();

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test-only: passing dummy engine to onPreUpdate
      gate.onPreUpdate(undefined as never, GATE_TRANSITION_DURATION_MS);

      await expect(promise1).resolves.toBeUndefined();
      await expect(promise2).resolves.toBeUndefined();
      await expect(promise3).resolves.toBeUndefined();
    });
  });

  describe('waitForOpen', () => {
    it('resolves immediately when gate is already open with no animation', async () => {
      const gate = new GateActor(true, vec(100, POSITION_Y));

      await expect(gate.waitForOpen()).resolves.toBeUndefined();
    });

    it('returns pending promise on freshly constructed closed gate before any setOpen call', async () => {
      const gate = new GateActor(false, vec(100, POSITION_Y));

      let resolved = false;
      void gate.waitForOpen().then(() => {
        resolved = true;
        return undefined;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);
    });
  });
});

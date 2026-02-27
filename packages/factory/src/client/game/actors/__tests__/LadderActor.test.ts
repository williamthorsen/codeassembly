import { describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsUse, mockRectangleConstructor, mockGraphicsGroupConstructor } = vi.hoisted(
  () => {
    return {
      mockActorConstructor: vi.fn(),
      mockGraphicsUse: vi.fn(),
      mockRectangleConstructor: vi.fn(),
      mockGraphicsGroupConstructor: vi.fn(),
    };
  },
);

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: mockGraphicsUse };
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
      mockRectangleConstructor(options);
      this.options = options;
    }
  }

  class MockGraphicsGroup {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      mockGraphicsGroupConstructor(options);
      this.options = options;
    }
  }

  return {
    Actor: MockActor,
    Color: MockColor,
    Rectangle: MockRectangle,
    GraphicsGroup: MockGraphicsGroup,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { LadderActor } = await import('../LadderActor.js');
const { Color } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('LadderActor', () => {
  it('creates Actor at topY so GraphicsGroup renders downward from top', () => {
    new LadderActor(650, 400, 344);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos: { x: 650, y: 344 },
        height: 56,
      }),
    );
  });

  it('uses brown color for rails and rungs', () => {
    new LadderActor(650, 400, 344);

    const brownColor = Color.fromHex(PALETTE.brown);

    // All rectangles should use brown color
    for (const call of mockRectangleConstructor.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ color: brownColor }));
    }
  });

  it('creates a GraphicsGroup with rails and rungs', () => {
    mockGraphicsGroupConstructor.mockClear();
    new LadderActor(650, 400, 344);

    expect(mockGraphicsGroupConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        useAnchor: false,
        members: expect.arrayContaining([expect.objectContaining({ offset: { x: 0, y: 0 } })]),
      }),
    );
  });

  it('calls graphics.use() with the GraphicsGroup', () => {
    mockGraphicsUse.mockClear();
    new LadderActor(650, 400, 344);

    expect(mockGraphicsUse).toHaveBeenCalled();
  });

  it('creates at least 2 rails plus rungs as members', () => {
    mockGraphicsGroupConstructor.mockClear();
    new LadderActor(650, 400, 344);

    expect(mockGraphicsGroupConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        members: expect.arrayContaining([
          expect.objectContaining({ offset: { x: 0, y: 0 } }),
          expect.objectContaining({ offset: expect.objectContaining({ x: 14 }) }),
          expect.objectContaining({ offset: expect.objectContaining({ y: 6 }) }),
        ]),
      }),
    );
  });

  it('creates exactly 1 rung when height is less than RUNG_SPACING', () => {
    mockRectangleConstructor.mockClear();
    // height = 5, RUNG_SPACING = 12, Math.floor(5/12) = 0, Math.max(1, 0) = 1
    new LadderActor(100, 105, 100);

    // 2 rails + 1 rung = 3 rectangles total
    expect(mockRectangleConstructor).toHaveBeenCalledTimes(3);
  });

  it('handles zero-height ladder with 1 rung', () => {
    mockRectangleConstructor.mockClear();
    // height = 0, Math.floor(0/12) = 0, Math.max(1, 0) = 1
    new LadderActor(100, 100, 100);

    // 2 rails + 1 rung = 3 rectangles total
    expect(mockRectangleConstructor).toHaveBeenCalledTimes(3);
  });
});

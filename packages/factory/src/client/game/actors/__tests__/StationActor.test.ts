import { describe, expect, it, vi } from 'vitest';

const {
  mockActorConstructor,
  mockGraphicsUse,
  mockRectangleConstructor,
  mockTextConstructor,
  mockGraphicsGroupConstructor,
} = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsUse: vi.fn(),
    mockRectangleConstructor: vi.fn(),
    mockTextConstructor: vi.fn(),
    mockGraphicsGroupConstructor: vi.fn(),
  };
});

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

  const MockTextAlign = { Center: 'center' };

  class MockFont {
    size: number;
    textAlign: string | undefined;
    constructor(opts: { size: number; textAlign?: string }) {
      this.size = opts.size;
      this.textAlign = opts.textAlign;
    }
  }

  class MockText {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      mockTextConstructor(options);
      this.options = options;
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
    Font: MockFont,
    Text: MockText,
    TextAlign: MockTextAlign,
    Rectangle: MockRectangle,
    GraphicsGroup: MockGraphicsGroup,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { StationActor } = await import('../StationActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('StationActor', () => {
  it('creates a Rectangle with semi-transparent lightGray when active', () => {
    new StationActor('architect', true, vec(100, 200));

    const expectedColor = Color.fromHex(PALETTE.lightGray);
    expectedColor.a = 0.15;
    expect(mockRectangleConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 100,
        height: 40,
        color: expectedColor,
      }),
    );
  });

  it('creates a Rectangle with semi-transparent darkGray when inactive', () => {
    new StationActor('architect', false, vec(100, 200));

    const expectedColor = Color.fromHex(PALETTE.darkGray);
    expectedColor.a = 0.15;
    expect(mockRectangleConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expectedColor,
      }),
    );
  });

  it('creates a Text label with the role name at reduced opacity', () => {
    new StationActor('planner', true, vec(0, 0));

    const expectedColor = Color.fromHex(PALETTE.white);
    expectedColor.a = 0.6;
    expect(mockTextConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'planner',
        color: expectedColor,
      }),
    );
  });

  it('creates a GraphicsGroup composing rectangle and text', () => {
    new StationActor('coder', true, vec(0, 0));

    expect(mockGraphicsGroupConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        members: expect.arrayContaining([
          expect.objectContaining({ offset: { x: 0, y: 0 } }),
          expect.objectContaining({ useBounds: false }),
        ]),
      }),
    );
  });

  it('uses the GraphicsGroup via graphics.use()', () => {
    new StationActor('reviewer', true, vec(0, 0));

    expect(mockGraphicsUse).toHaveBeenCalled();
  });

  it('sets correct dimensions on the Actor', () => {
    new StationActor('architect', true, vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 100,
        height: 40,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new StationActor('holistic-reviewer', false, pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });

  it('positions label centered on platform below station', () => {
    new StationActor('architect', true, vec(0, 0));

    expect(mockGraphicsGroupConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        members: expect.arrayContaining([
          expect.objectContaining({ offset: { x: 50, y: 25 }, useBounds: false }),
        ]),
      }),
    );
  });

  it('uses center-aligned text on the Font', () => {
    new StationActor('coder', true, vec(0, 0));

    expect(mockTextConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        font: expect.objectContaining({ textAlign: 'center' }),
      }),
    );
  });
});

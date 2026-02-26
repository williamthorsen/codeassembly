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

  class MockFont {
    size: number;
    constructor(opts: { size: number }) {
      this.size = opts.size;
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
    Rectangle: MockRectangle,
    GraphicsGroup: MockGraphicsGroup,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { StationActor } = await import('../StationActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('StationActor', () => {
  it('creates a Rectangle with lightGray color when active', () => {
    new StationActor('architecture', true, vec(100, 200));

    expect(mockRectangleConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 100,
        height: 60,
        color: Color.fromHex(PALETTE.lightGray),
      }),
    );
  });

  it('creates a Rectangle with darkGray color when inactive', () => {
    new StationActor('architecture', false, vec(100, 200));

    expect(mockRectangleConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.darkGray),
      }),
    );
  });

  it('creates a Text label with the phase name', () => {
    new StationActor('planning', true, vec(0, 0));

    expect(mockTextConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'planning',
        color: Color.fromHex(PALETTE.white),
      }),
    );
  });

  it('creates a GraphicsGroup composing rectangle and text', () => {
    new StationActor('implementation', true, vec(0, 0));

    expect(mockGraphicsGroupConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        useAnchor: false,
        members: expect.arrayContaining([
          expect.objectContaining({ offset: { x: 0, y: 0 } }),
          expect.objectContaining({ useBounds: false }),
        ]),
      }),
    );
  });

  it('uses the GraphicsGroup via graphics.use()', () => {
    new StationActor('review', true, vec(0, 0));

    expect(mockGraphicsUse).toHaveBeenCalled();
  });

  it('sets correct dimensions on the Actor', () => {
    new StationActor('architecture', true, vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 100,
        height: 60,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new StationActor('holistic', false, pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });
});

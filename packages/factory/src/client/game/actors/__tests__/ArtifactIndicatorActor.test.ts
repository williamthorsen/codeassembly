import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockActorConstructor, mockGraphicsIsVisible } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    mockGraphicsIsVisible: { value: true },
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = {
      get isVisible() {
        return mockGraphicsIsVisible.value;
      },
      set isVisible(v: boolean) {
        mockGraphicsIsVisible.value = v;
      },
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

  return {
    Actor: MockActor,
    Color: MockColor,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { ArtifactIndicatorActor } = await import('../ArtifactIndicatorActor.js');
const { Color } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('ArtifactIndicatorActor', () => {
  afterEach(() => {
    mockGraphicsIsVisible.value = true;
    vi.clearAllMocks();
  });

  it.each([
    ['architecture', (): string => PALETTE.blue],
    ['plan', (): string => PALETTE.green],
    ['code', (): string => PALETTE.yellow],
    ['review', (): string => PALETTE.red],
  ])('uses correct color for %s type', (type, getExpectedColor) => {
    new ArtifactIndicatorActor(type);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ color: Color.fromHex(getExpectedColor()) }),
    );
  });

  it('falls back to cyan for unknown types', () => {
    new ArtifactIndicatorActor('unknown-type');

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.cyan),
      }),
    );
  });

  it('sets correct dimensions', () => {
    new ArtifactIndicatorActor('architecture');

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 8,
        height: 8,
      }),
    );
  });

  it('sets position as relative offset above parent', () => {
    new ArtifactIndicatorActor('architecture');

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos: { x: 0, y: -20 },
      }),
    );
  });

  it('starts with graphics.isVisible set to false', () => {
    const indicator = new ArtifactIndicatorActor('architecture');

    expect(indicator.graphics.isVisible).toBe(false);
  });

  it('show() sets graphics.isVisible to true', () => {
    const indicator = new ArtifactIndicatorActor('architecture');

    indicator.show();

    expect(indicator.graphics.isVisible).toBe(true);
  });

  it('hide() sets graphics.isVisible to false after show()', () => {
    const indicator = new ArtifactIndicatorActor('architecture');
    indicator.show();

    indicator.hide();

    expect(indicator.graphics.isVisible).toBe(false);
  });
});

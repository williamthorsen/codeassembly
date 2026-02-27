import { describe, expect, it, vi } from 'vitest';

const { mockActorConstructor } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
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

const { PlatformActor } = await import('../PlatformActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('PlatformActor', () => {
  it('uses darkGray color', () => {
    new PlatformActor(vec(600, 400), 1100, 20);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.darkGray),
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 200);
    new PlatformActor(pos, 500, 10);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });

  it('sets correct dimensions', () => {
    new PlatformActor(vec(0, 0), 800, 15);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 800,
        height: 15,
      }),
    );
  });
});

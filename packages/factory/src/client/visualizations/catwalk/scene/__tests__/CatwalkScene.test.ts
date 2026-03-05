import { describe, expect, it, vi } from 'vitest';

vi.mock('excalibur', () => {
  class MockScene {
    backgroundColor: unknown;
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
    Scene: MockScene,
    Color: MockColor,
  };
});

const { CatwalkScene } = await import('../CatwalkScene.js');

describe('CatwalkScene', () => {
  it('sets the background color to #111111', () => {
    const scene = new CatwalkScene();

    expect(scene.backgroundColor).toEqual(expect.objectContaining({ hex: '#111111' }));
  });
});

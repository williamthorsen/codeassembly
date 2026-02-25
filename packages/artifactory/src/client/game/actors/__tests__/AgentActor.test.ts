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

const { AgentActor } = await import('../AgentActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('AgentActor', () => {
  it('uses correct color for architect role', () => {
    const pos = vec(100, 200);
    new AgentActor('architect', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
        width: 20,
        height: 30,
        color: Color.fromHex(PALETTE.blue),
      }),
    );
  });

  it('uses correct color for planner role', () => {
    new AgentActor('planner', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.green),
      }),
    );
  });

  it('uses correct color for coder role', () => {
    new AgentActor('coder', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.yellow),
      }),
    );
  });

  it('uses correct color for reviewer role', () => {
    new AgentActor('reviewer', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.red),
      }),
    );
  });

  it('falls back to white for unknown roles', () => {
    new AgentActor('unknown-role', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.white),
      }),
    );
  });

  it('sets correct dimensions', () => {
    new AgentActor('architect', vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 20,
        height: 30,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new AgentActor('coder', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });
});

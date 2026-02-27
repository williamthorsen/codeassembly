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
const { ROLE_TYPE_COLORS } = await import('../../../../shared/constants/role-types.js');

describe('AgentActor', () => {
  it('uses correct color for orchestrator roleType', () => {
    new AgentActor('orchestrator', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(ROLE_TYPE_COLORS.orchestrator),
      }),
    );
  });

  it('uses correct color for analyst roleType', () => {
    const pos = vec(100, 200);
    new AgentActor('analyst', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
        width: 20,
        height: 30,
        color: Color.fromHex(ROLE_TYPE_COLORS.analyst),
      }),
    );
  });

  it('uses correct color for planner roleType', () => {
    new AgentActor('planner', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(ROLE_TYPE_COLORS.planner),
      }),
    );
  });

  it('uses correct color for author roleType', () => {
    new AgentActor('author', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(ROLE_TYPE_COLORS.author),
      }),
    );
  });

  it('uses correct color for reviewer roleType', () => {
    new AgentActor('reviewer', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(ROLE_TYPE_COLORS.reviewer),
      }),
    );
  });

  it('sets correct dimensions', () => {
    new AgentActor('analyst', vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 20,
        height: 30,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new AgentActor('author', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });
});

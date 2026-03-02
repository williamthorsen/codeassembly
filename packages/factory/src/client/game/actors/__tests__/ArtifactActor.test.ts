import { describe, expect, it, vi } from 'vitest';

type EventHandler = (...args: unknown[]) => void;

const { mockActorConstructor, lastActorHandlers } = vi.hoisted(() => {
  return {
    mockActorConstructor: vi.fn(),
    lastActorHandlers: new Map<string, EventHandler>(),
  };
});

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      mockActorConstructor(config);
      this.config = config;
      lastActorHandlers.clear();
    }
    on(event: string, handler: EventHandler) {
      lastActorHandlers.set(event, handler);
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

const { ArtifactActor } = await import('../ArtifactActor.js');
const { Color, vec } = await import('excalibur');
const { PALETTE } = await import('../../../../shared/constants/palette.js');

describe('ArtifactActor', () => {
  it('uses correct color for architecture type', () => {
    new ArtifactActor('architecture', vec(100, 200));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.blue),
      }),
    );
  });

  it('uses correct color for plan type', () => {
    new ArtifactActor('plan', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.green),
      }),
    );
  });

  it('uses correct color for code type', () => {
    new ArtifactActor('code', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.yellow),
      }),
    );
  });

  it('uses correct color for review type', () => {
    new ArtifactActor('review', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.red),
      }),
    );
  });

  it('falls back to cyan for unknown types', () => {
    new ArtifactActor('unknown-type', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.cyan),
      }),
    );
  });

  it('falls back to 12x12 when size argument is omitted', () => {
    new ArtifactActor('architecture', vec(50, 75));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 12,
        height: 12,
      }),
    );
  });

  it('passes position to Actor constructor', () => {
    const pos = vec(300, 400);
    new ArtifactActor('code', pos);

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        pos,
      }),
    );
  });

  it('uses provided size when size argument is passed', () => {
    new ArtifactActor('architecture', vec(50, 75), { width: 20, height: 8 });

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 20,
        height: 8,
      }),
    );
  });

  it('uses correct color for simplifier type', () => {
    new ArtifactActor('simplifier', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.darkMagenta),
      }),
    );
  });

  it('uses correct color for holistic type', () => {
    new ArtifactActor('holistic', vec(0, 0));

    expect(mockActorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        color: Color.fromHex(PALETTE.darkCyan),
      }),
    );
  });

  describe('pointer events', () => {
    it('does not register event listeners when callbacks is omitted', () => {
      new ArtifactActor('code', vec(0, 0));

      expect(lastActorHandlers.size).toBe(0);
    });

    it('fires onEnter with page coordinates on pointerenter', () => {
      const onEnter = vi.fn();
      const onLeave = vi.fn();
      new ArtifactActor('code', vec(0, 0), undefined, { onEnter, onLeave });

      const handler = lastActorHandlers.get('pointerenter');
      expect(handler).toBeDefined();
      if (handler === undefined) throw new Error('Expected pointerenter handler to be registered');

      const mockEvt = { pagePos: { x: 150, y: 250 } };
      handler(mockEvt);

      expect(onEnter).toHaveBeenCalledWith(150, 250);
    });

    it('fires onLeave on pointerleave', () => {
      const onEnter = vi.fn();
      const onLeave = vi.fn();
      new ArtifactActor('code', vec(0, 0), undefined, { onEnter, onLeave });

      const handler = lastActorHandlers.get('pointerleave');
      expect(handler).toBeDefined();
      if (handler === undefined) throw new Error('Expected pointerleave handler to be registered');

      handler();

      expect(onLeave).toHaveBeenCalled();
    });
  });
});

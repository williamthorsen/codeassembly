import { describe, expect, it, vi } from 'vitest';

import type { LogicalSceneState } from '../../shared/types.js';

// Track actors added/removed through the mock
let actorCount = 0;

// Mock Excalibur to avoid canvas/WebGL dependencies in tests
vi.mock('excalibur', () => {
  class MockGraphic {
    opacity = 1;
    use() {}
  }
  class MockActor {
    pos = { x: 0, y: 0 };
    graphics = new MockGraphic();
    constructor(opts?: { pos?: { x: number; y: number } }) {
      if (opts?.pos) this.pos = opts.pos;
    }
  }
  class MockScene {
    backgroundColor = { r: 0, g: 0, b: 0 };
    camera = { pos: { x: 0, y: 0 }, zoom: 1 };
    add(_actor: MockActor) {
      actorCount++;
    }
    remove(_actor: MockActor) {
      actorCount--;
    }
  }

  return {
    Actor: MockActor,
    Circle: class {},
    Color: {
      fromHex: (hex: string) => ({ hex }),
      Transparent: { hex: 'transparent' },
    },
    Font: class {},
    Label: MockActor,
    Rectangle: class {},
    Scene: MockScene,
    TextAlign: { Center: 'center' },
    vec: (x: number, y: number) => ({ x, y }),
  };
});

// Import after mocking
const { OfficeScene } = await import('../scene/OfficeScene.js');

/** Build a minimal LogicalSceneState. */
function logicalScene(overrides: Partial<LogicalSceneState> = {}): LogicalSceneState {
  return {
    runStatus: 'in_progress',
    currentPhase: undefined,
    agents: [],
    orchestrator: {
      status: 'idle',
      carriedArtifacts: [],
      codeBadge: null,
      waiting: false,
    },
    artifacts: [],
    ...overrides,
  };
}

describe('OfficeScene', () => {
  it('can be constructed', () => {
    const scene = new OfficeScene();
    expect(scene).toBeDefined();
  });

  it('draws zone rectangles on initialize', () => {
    actorCount = 0;
    const scene = new OfficeScene();
    scene.onInitialize();

    // 3 zones x 3 actors each (fill, border, label) = 9
    expect(actorCount).toBe(9);
  });

  it('places entities when updateState is called', () => {
    actorCount = 0;
    const scene = new OfficeScene();
    scene.onInitialize();
    const initialCount = actorCount;

    scene.updateState(
      logicalScene({
        agents: [{ id: 'a1', role: 'coder', roleType: 'author', phase: 'implementation', status: 'working' }],
      }),
    );

    // Should have added orchestrator + 1 agent
    expect(actorCount).toBe(initialCount + 2);
  });

  it('handles empty state gracefully', () => {
    actorCount = 0;
    const scene = new OfficeScene();
    scene.onInitialize();

    // Should not throw
    scene.updateState(logicalScene());

    // 9 zone actors + 1 orchestrator
    expect(actorCount).toBe(10);
  });

  it('clears and replaces entities on subsequent updateState calls', () => {
    actorCount = 0;
    const scene = new OfficeScene();
    scene.onInitialize();

    scene.updateState(
      logicalScene({
        agents: [
          { id: 'a1', role: 'coder', roleType: 'author', phase: 'implementation', status: 'working' },
          { id: 'a2', role: 'architect', roleType: 'analyst', phase: 'architecture', status: 'idle' },
        ],
      }),
    );

    const firstCount = actorCount;

    scene.updateState(
      logicalScene({
        agents: [{ id: 'a1', role: 'coder', roleType: 'author', phase: 'implementation', status: 'done' }],
      }),
    );

    // Went from 2 agents to 1 agent, so should be one fewer
    expect(actorCount).toBe(firstCount - 1);
  });

  it('places artifacts at assigned positions', () => {
    actorCount = 0;
    const scene = new OfficeScene();
    scene.onInitialize();

    scene.updateState(
      logicalScene({
        artifacts: [
          {
            id: 'art1',
            label: 'plan',
            color: '#00ff00',
            status: 'delivered',
            producerPhase: 'planning',
          },
        ],
      }),
    );

    // 9 zone actors + 1 orchestrator + 1 artifact
    expect(actorCount).toBe(11);
  });
});

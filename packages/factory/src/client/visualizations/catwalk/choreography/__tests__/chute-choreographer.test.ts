import { describe, expect, it, vi } from 'vitest';

import type { CatwalkLayoutResult, ChuteEndpoints, Position } from '../../layout/catwalk-layout.js';
import type { CatwalkDiff, OrchestratorDiff, StationArtifactConfig } from '../../types.js';
import type { SceneRefs } from '../chute-choreographer.js';

vi.mock('excalibur', () => {
  class MockActor {
    config: Record<string, unknown>;
    graphics = { use: vi.fn(), opacity: 1 };
    pos = { x: 0, y: 0 };
    actions = {
      moveTo: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
      fade: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
    };
    kill = vi.fn();
    children: unknown[] = [];
    constructor(config: Record<string, unknown>) {
      this.config = config;
    }
    addChild(child: unknown) {
      this.children.push(child);
    }
    removeChild(child: unknown) {
      this.children = this.children.filter((c) => c !== child);
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
      this.options = options;
    }
  }

  class MockFont {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockText {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  class MockGraphicsGroup {
    options: Record<string, unknown>;
    constructor(options: Record<string, unknown>) {
      this.options = options;
    }
  }

  const MockTextAlign = { Center: 'center' };
  const MockBaseAlign = { Middle: 'middle' };

  return {
    Actor: MockActor,
    Color: MockColor,
    Rectangle: MockRectangle,
    Text: MockText,
    Font: MockFont,
    GraphicsGroup: MockGraphicsGroup,
    TextAlign: MockTextAlign,
    BaseAlign: MockBaseAlign,
    vec: (x: number, y: number) => ({ x, y }),
  };
});

const { choreograph } = await import('../chute-choreographer.js');

/** Create a minimal orchestrator diff. */
function orchestratorDiff(overrides: Partial<OrchestratorDiff> = {}): OrchestratorDiff {
  return {
    moved: null,
    workingChanged: null,
    celebratingChanged: null,
    carriedChanged: null,
    codeBadgeChanged: null,
    ...overrides,
  };
}

/** Create a minimal CatwalkDiff. */
function catwalkDiff(overrides: Partial<CatwalkDiff> = {}): CatwalkDiff {
  return {
    orchestrator: orchestratorDiff(),
    agents: { stateChanged: [], added: [], removed: [] },
    gates: { opened: [] },
    artifacts: { added: [] },
    hasChanges: true,
    ...overrides,
  };
}

/** Create a mock layout that returns predictable positions. */
function mockLayout(): CatwalkLayoutResult {
  const stationPositions = [100, 300, 500];
  function stationX(index: number): number {
    const pos = stationPositions[index];
    if (pos === undefined) throw new RangeError(`station ${index}`);
    return pos;
  }
  return {
    stationX,
    agentPosition: (si: number, _slot: number, _count: number): Position => ({ x: stationX(si), y: 340 }),
    orchestratorPosition: (si: number): Position => ({ x: stationX(si), y: 100 }),
    chuteEndpoints: (si: number, _slot: number, _count: number): ChuteEndpoints => ({
      topX: stationX(si),
      topY: 148,
      botX: stationX(si),
      botY: 320,
    }),
    gatePosition: (_l: number, _r: number) => ({ x: 200, y: 100 }),
    railEndpoints: () => ({ x1: 25, x2: 575, y: 100 }),
    groundEndpoints: () => ({ x1: 25, x2: 575, y: 382 }),
    outputArtifactPosition: (si: number, _slot: number, _count: number, _stack: number): Position => ({
      x: stationX(si),
      y: 400,
    }),
    inputArtifactPosition: (si: number, _count: number, _stack: number): Position => ({ x: stationX(si) - 40, y: 400 }),
    dividerPosition: (si: number, _count: number) => ({ x: stationX(si) - 20, y1: 382, y2: 500 }),
    stationLabelPosition: (si: number): Position => ({ x: stationX(si), y: 400 }),
    bounds: { minX: 0, maxX: 600, minY: 0, maxY: 540 },
    platformWidth: 600,
  };
}

/** Create a mock orchestrator actor. */
function mockOrchestrator() {
  return {
    animateMoveTo: vi.fn().mockResolvedValue(undefined),
    setWorking: vi.fn(),
    setCarriedArtifacts: vi.fn(),
    setCodeBadge: vi.fn(),
    actions: {
      moveTo: vi.fn().mockReturnValue({ toPromise: vi.fn().mockResolvedValue(undefined) }),
    },
  };
}

/** Create mock scene refs. */
function mockRefs(
  overrides: Partial<SceneRefs> = {},
): SceneRefs & { addedActors: unknown[]; addedArtifacts: StationArtifactConfig[] } {
  const addedActors: unknown[] = [];
  const addedArtifacts: StationArtifactConfig[] = [];
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock matches OrchestratorActor interface
    orchestrator: mockOrchestrator() as unknown as SceneRefs['orchestrator'],
    agents: new Map(),
    gates: new Map(),
    agentCountByStation: new Map<number, number>([
      [0, 1],
      [1, 1],
      [2, 1],
    ]),
    addActor: (actor: unknown) => {
      addedActors.push(actor);
    },
    addArtifact: (artifact: StationArtifactConfig) => {
      addedArtifacts.push(artifact);
    },
    addedActors,
    addedArtifacts,
    ...overrides,
  };
}

describe('choreograph', () => {
  describe('non-delivery diffs', () => {
    it('applies orchestrator move immediately when no artifacts are added', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreograph(diff, layout, refs);

      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalled();
    });

    it('applies working state change', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ workingChanged: { from: false, to: true } }),
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setWorking).toHaveBeenCalledWith(true);
    });

    it('applies carried artifacts change', async () => {
      const carried = [{ label: 'code', color: '#fff3bf' }];
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ carriedChanged: { from: [], to: carried } }),
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith(carried);
    });

    it('applies code badge change', async () => {
      const badge = { label: 'v2', color: '#ffaa00' };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ codeBadgeChanged: { from: null, to: badge } }),
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setCodeBadge).toHaveBeenCalledWith(badge);
    });

    it('applies agent state changes via refs.agents', async () => {
      const mockAgent = { animateToState: vi.fn(), fadeIn: vi.fn() };
      const agents = new Map([['arch', mockAgent]]);
      const diff = catwalkDiff({
        agents: {
          stateChanged: [{ agentId: 'arch', from: 'working', to: 'resting' }],
          added: [],
          removed: [],
        },
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock
      const refs = mockRefs({ agents: agents as unknown as SceneRefs['agents'] });

      await choreograph(diff, mockLayout(), refs);

      expect(mockAgent.animateToState).toHaveBeenCalledWith('resting');
    });

    it('applies gate open animations via refs.gates', async () => {
      const mockGate = { animateOpen: vi.fn(), updateConfig: vi.fn() };
      const gates = new Map([['0:1', mockGate]]);
      const diff = catwalkDiff({
        gates: { opened: [{ betweenStations: [0, 1], open: true }] },
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock
      const refs = mockRefs({ gates: gates as unknown as SceneRefs['gates'] });

      await choreograph(diff, mockLayout(), refs);

      expect(mockGate.animateOpen).toHaveBeenCalled();
    });

    it('adds artifacts via refs.addArtifact', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'architecture',
        color: '#a5d8ff',
        slot: 'output',
      };
      const diff = catwalkDiff({
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      expect(refs.addedArtifacts).toHaveLength(1);
      expect(refs.addedArtifacts[0]).toBe(artifact);
    });
  });

  describe('delivery sequence', () => {
    it('creates flying artifact actors when orchestrator moves with input artifacts at destination', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 1,
        agentSlotIndex: 0,
        label: 'architecture',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // Two flying actors should have been added: one ascend + one descend
      expect(refs.addedActors.length).toBe(2);
    });

    it('uses origin chute endpoints for ascend and destination chute endpoints for descend', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreograph(diff, layout, refs);

      // Two flying actors: ascend (station 0, x=100) then descend (station 1, x=300)
      expect(refs.addedActors.length).toBe(2);
      const [ascendActor, descendActor] = refs.addedActors;

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Inspecting mock FlyingArtifactActor constructor config
      const ascendConfig = (ascendActor as { config: { pos: { x: number; y: number } } }).config;
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Inspecting mock FlyingArtifactActor constructor config
      const descendConfig = (descendActor as { config: { pos: { x: number; y: number } } }).config;

      // Ascend starts at bottom of origin station's chute (station 0 -> botX=100)
      expect(ascendConfig.pos.x).toBe(100);
      // Descend starts at top of destination station's chute (station 1 -> topX=300)
      expect(descendConfig.pos.x).toBe(300);
    });

    it('calls setCarriedArtifacts during delivery when carriedChanged is set', async () => {
      const carried = [{ label: 'arch', color: '#a5d8ff' }];
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({
          moved: { from: 0, to: 1 },
          carriedChanged: { from: [], to: carried },
        }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // setCarriedArtifacts should be called twice: once to pick up, once to clear
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledTimes(2);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith(carried);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith([]);
    });

    it('walks the orchestrator to the destination station', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 2 } }),
        artifacts: { added: [{ stationIndex: 2, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalled();
    });

    it('adds delivery artifacts at destination after delivery completes', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 1,
        agentSlotIndex: 0,
        label: 'architecture',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // The delivery artifact should be added as a landed artifact at the destination
      expect(refs.addedArtifacts).toContain(artifact);
    });

    it('adds non-delivery artifacts immediately', async () => {
      const deliveryArtifact: StationArtifactConfig = {
        stationIndex: 1,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#a5d8ff',
        slot: 'input',
      };
      const outputArtifact: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#a5d8ff',
        slot: 'output',
      };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [deliveryArtifact, outputArtifact] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // Both artifacts should end up in addedArtifacts
      expect(refs.addedArtifacts).toContain(deliveryArtifact);
      expect(refs.addedArtifacts).toContain(outputArtifact);
    });

    it('uses default slot 0 chute at origin for ascend', async () => {
      // Delivery input has agentSlotIndex 0, but we verify the ascend uses
      // the origin station's slot-0 chute regardless
      const artifact: StationArtifactConfig = {
        stationIndex: 1,
        agentSlotIndex: 0,
        label: 'plan',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreograph(diff, layout, refs);

      expect(refs.addedActors.length).toBe(2);
      const [ascendActor] = refs.addedActors;

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Inspecting mock FlyingArtifactActor constructor config
      const ascendConfig = (ascendActor as { config: { pos: { x: number; y: number } } }).config;

      // Ascend should use station 0 (origin) chute position
      expect(ascendConfig.pos.x).toBe(layout.stationX(0));
    });

    it('clears carried artifacts unconditionally at step 5 even when carriedChanged is null', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({
          moved: { from: 0, to: 1 },
          carriedChanged: null,
        }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // Even without a carriedChanged diff, step 5 should unconditionally clear
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledTimes(1);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith([]);
    });

    it('falls back to applyImmediate when orchestrator moves but no inputs at destination', async () => {
      // Output artifact at origin, but no input at destination -- not a delivery
      const outputArtifact: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#a5d8ff',
        slot: 'output',
      };
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [outputArtifact] },
      });
      const refs = mockRefs();

      await choreograph(diff, mockLayout(), refs);

      // Should use applyImmediate path: no flying actors, artifact added directly
      expect(refs.addedActors.length).toBe(0);
      expect(refs.addedArtifacts).toContain(outputArtifact);
      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalled();
    });

    it('sequences ascend before walk and walk before descend', async () => {
      const callLog: string[] = [];

      // Helper to flush all microtasks
      async function flushMicrotasks(): Promise<void> {
        for (let i = 0; i < 10; i++) {
          await Promise.resolve();
        }
      }

      // Create deferred promises so we can control resolution order
      let resolveAscend: (() => void) | undefined;
      const ascendPromise = new Promise<void>((resolve) => {
        resolveAscend = resolve;
      });
      let resolveWalk: (() => void) | undefined;
      const walkPromise = new Promise<void>((resolve) => {
        resolveWalk = resolve;
      });

      const orchestrator = {
        animateMoveTo: vi.fn().mockImplementation(async () => {
          callLog.push('walk-start');
          await walkPromise;
          callLog.push('walk-end');
        }),
        setWorking: vi.fn(),
        setCarriedArtifacts: vi.fn(),
        setCodeBadge: vi.fn(),
      };

      const addedActors: unknown[] = [];
      const refs = mockRefs({
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock matches OrchestratorActor interface
        orchestrator: orchestrator as unknown as SceneRefs['orchestrator'],
        addActor: (actor: unknown) => {
          addedActors.push(actor);
          // Patch the flying actor's ascend/descend to use our deferred promises.
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Accessing mock FlyingArtifactActor methods
          const flyingActor = actor as Record<string, unknown>;
          if (typeof flyingActor.ascend === 'function') {
            flyingActor.ascend = async () => {
              callLog.push('ascend-start');
              await ascendPromise;
              callLog.push('ascend-end');
            };
          }
          if (typeof flyingActor.descend === 'function') {
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Accessing mock FlyingArtifactActor methods
            const originalDescend = flyingActor.descend as () => Promise<void>;
            flyingActor.descend = async () => {
              callLog.push('descend-start');
              await originalDescend.call(flyingActor);
              callLog.push('descend-end');
            };
          }
        },
      });

      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });

      const choreographPromise = choreograph(diff, mockLayout(), refs);

      // Let microtasks settle -- ascend should have started but walk should not yet
      await flushMicrotasks();
      expect(callLog).toContain('ascend-start');
      expect(callLog).not.toContain('walk-start');

      // Resolve ascend
      if (resolveAscend !== undefined) resolveAscend();
      await flushMicrotasks();

      // Walk should now have started but descend should not yet
      expect(callLog).toContain('walk-start');
      expect(callLog).not.toContain('descend-start');

      // Resolve walk
      if (resolveWalk !== undefined) resolveWalk();
      await choreographPromise;

      // All steps should have completed in order
      const ascendStartIdx = callLog.indexOf('ascend-start');
      const walkStartIdx = callLog.indexOf('walk-start');
      const descendStartIdx = callLog.indexOf('descend-start');
      expect(ascendStartIdx).toBeLessThan(walkStartIdx);
      expect(walkStartIdx).toBeLessThan(descendStartIdx);
    });
  });

  describe('without orchestrator', () => {
    it('does not crash when orchestrator is undefined', async () => {
      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
      });
      const refs = mockRefs({ orchestrator: undefined });

      await expect(choreograph(diff, mockLayout(), refs)).resolves.toBeUndefined();
    });
  });

  describe('suppressKilledActorError', () => {
    it('silently swallows known killed-actor rejections', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });

      const refs = mockRefs({
        addActor: (actor: unknown) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Patching mock FlyingArtifactActor
          const flyer = actor as Record<string, unknown>;
          if (typeof flyer.ascend === 'function') {
            flyer.ascend = () => Promise.reject(new Error('Actor has been killed'));
          }
          if (typeof flyer.descend === 'function') {
            flyer.descend = () => Promise.reject(new Error('Actor has been killed'));
          }
        },
      });

      await choreograph(diff, mockLayout(), refs);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('logs unexpected rejections via console.error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const diff = catwalkDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 1 } }),
        artifacts: { added: [{ stationIndex: 1, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });

      const refs = mockRefs({
        addActor: (actor: unknown) => {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Patching mock FlyingArtifactActor
          const flyer = actor as Record<string, unknown>;
          if (typeof flyer.ascend === 'function') {
            flyer.ascend = () => Promise.reject(new Error('Unexpected error'));
          }
          if (typeof flyer.descend === 'function') {
            flyer.descend = () => Promise.reject(new Error('Unexpected error'));
          }
        },
      });

      await choreograph(diff, mockLayout(), refs);

      expect(consoleSpy).toHaveBeenCalledWith('Unexpected animation error:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});

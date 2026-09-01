import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { describe, expect, it, vi } from 'vitest';

import type { ChuteEndpoints, FactoryFloorLayoutResult, Position } from '../../layout/factory-floor-layout.js';
import type { FactoryFloorDiff, OrchestratorDiff, StationArtifactConfig, Zone } from '../../types.js';
import type { FloorSceneRefs } from '../floor-choreographer.js';

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

const { choreographFloor } = await import('../floor-choreographer.js');

/** Create a minimal orchestrator diff with optional overrides. */
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

/** Create a minimal factory-floor diff with optional overrides. */
function floorDiff(overrides: Partial<FactoryFloorDiff> = {}): FactoryFloorDiff {
  return {
    orchestrator: orchestratorDiff(),
    agents: { stateChanged: [], added: [], removed: [] },
    artifacts: { added: [] },
    hasChanges: true,
    ...overrides,
  };
}

/**
 * Zone assignments matching STATION_ZONE from dimensions.ts:
 * 0=upper, 1=upper, 2=rail, 3=lower, 4=lower, 5=lower, 6=rail.
 */
const ZONE_MAP: Record<number, Zone> = {
  0: 'upper',
  1: 'upper',
  2: 'rail',
  3: 'lower',
  4: 'lower',
  5: 'lower',
  6: 'rail',
};

/** Create a mock layout that returns predictable positions. */
function mockLayout(): FactoryFloorLayoutResult {
  const stationXPositions: Record<number, number> = {
    0: 150,
    1: 330,
    2: 480,
    3: 200,
    4: 560,
    5: 680,
    6: 640,
  };

  function stationX(index: number): number {
    const pos = stationXPositions[index];
    if (pos === undefined) throw new RangeError(`station ${index}`);
    return pos;
  }

  function zoneOf(stationIndex: number): Zone {
    const zone = ZONE_MAP[stationIndex];
    if (zone === undefined) throw new RangeError(`station ${stationIndex} has no zone`);
    return zone;
  }

  return {
    stationPosition: (index: number): Position => ({ x: stationX(index), y: 300 }),
    agentPosition: (si: number, _slot: number, _count: number): Position => ({ x: stationX(si), y: 340 }),
    orchestratorPosition: (si: number): Position => ({ x: stationX(si), y: 300 }),
    chuteEndpoints: (si: number, _slot: number, _count: number): ChuteEndpoints => ({
      topX: stationX(si),
      topY: 148,
      botX: stationX(si),
      botY: 320,
    }),
    hasChute: (si: number): boolean => {
      const zone = zoneOf(si);
      return zone === 'upper' || zone === 'lower';
    },
    zoneOf,
    railEndpoints: () => ({ x1: 25, x2: 575, y: 300 }),
    upperBoundaryEndpoints: () => ({ x1: 25, x2: 575, y: 220 }),
    lowerBoundaryEndpoints: () => ({ x1: 25, x2: 575, y: 380 }),
    coderRoomBounds: () => ({ left: 480, right: 580, top: 220, bottom: 380 }),
    orchestratorRoomBounds: () => ({ left: 580, right: 630, top: 220, bottom: 380 }),
    bounds: { minX: 0, maxX: 720, minY: 0, maxY: 600 },
    platformWidth: 720,
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

/** Create mock scene refs with tracking arrays. */
function mockRefs(
  overrides: Partial<FloorSceneRefs> = {},
): FloorSceneRefs & { addedActors: unknown[]; addedArtifacts: StationArtifactConfig[] } {
  const addedActors: unknown[] = [];
  const addedArtifacts: StationArtifactConfig[] = [];
  return {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock matches OrchestratorActor interface
    orchestrator: mockOrchestrator() as unknown as FloorSceneRefs['orchestrator'],
    agents: new Map(),
    agentCountByStation: new Map<number, number>([
      [0, 1],
      [1, 1],
      [2, 1],
      [3, 3],
      [4, 1],
      [5, 1],
      [6, 1],
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

describe(choreographFloor, () => {
  describe('applyImmediate path', () => {
    it('applies changes immediately when orchestrator has not moved', async () => {
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ workingChanged: { from: false, to: true } }),
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setWorking).toHaveBeenCalledWith(true);
      // No flying actors created
      expect(refs.addedActors).toHaveLength(0);
    });

    it('applies orchestrator move via applyImmediate when no input artifacts at destination', async () => {
      const outputArtifact: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#a5d8ff',
        slot: 'output',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
        artifacts: { added: [outputArtifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Should use applyImmediate: no flying actors, artifact added directly
      expect(refs.addedActors).toHaveLength(0);
      expect(refs.addedArtifacts).toContain(outputArtifact);
      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalled();
    });

    it('applies carried artifacts change immediately', async () => {
      const carried = [{ label: 'code', color: '#fff3bf' }];
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ carriedChanged: { from: [], to: carried } }),
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith(carried);
    });

    it('applies code badge change immediately', async () => {
      const badge = { label: 'v2', color: '#ffaa00' };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ codeBadgeChanged: { from: null, to: badge } }),
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      expect(refs.orchestrator?.setCodeBadge).toHaveBeenCalledWith(badge);
    });

    it('applies agent state changes via refs.agents', async () => {
      const mockAgent = { animateToState: vi.fn(), fadeIn: vi.fn() };
      const agents = new Map([['reviewer-1', mockAgent]]);
      const diff = floorDiff({
        agents: {
          stateChanged: [{ agentId: 'reviewer-1', from: 'working', to: 'resting' }],
          added: [],
          removed: [],
        },
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock
      const refs = mockRefs({ agents: agents as unknown as FloorSceneRefs['agents'] });

      await choreographFloor(diff, mockLayout(), refs);

      expect(mockAgent.animateToState).toHaveBeenCalledWith('resting');
    });

    it('removes agents by setting deactivated state and deleting from map', async () => {
      const mockAgent = { animateToState: vi.fn() };
      const agents = new Map([['reviewer-1', mockAgent]]);
      const diff = floorDiff({
        agents: {
          stateChanged: [],
          added: [],
          removed: [
            {
              id: 'reviewer-1',
              role: 'reviewer',
              roleType: 'reviewer',
              stationIndex: 3,
              slotIndex: 0,
              state: 'working',
            },
          ],
        },
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock
      const refs = mockRefs({ agents: agents as unknown as FloorSceneRefs['agents'] });

      await choreographFloor(diff, mockLayout(), refs);

      expect(mockAgent.animateToState).toHaveBeenCalledWith('deactivated');
      expect(refs.agents.has('reviewer-1')).toBe(false);
    });
  });

  describe('delivery with chute-eligible destination (lower zone)', () => {
    it('creates flying artifact actors for ascend and descend when destination is in lower zone', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 3,
        agentSlotIndex: 0,
        label: 'plan',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 1, to: 3 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Two flying actors: ascend at origin (station 1, upper zone) + descend at destination (station 3, lower zone)
      expect(refs.addedActors).toHaveLength(2);
    });

    it('uses correct chute direction based on zone: descend from upper origin, descend to lower destination', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 3,
        agentSlotIndex: 0,
        label: 'plan',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreographFloor(diff, layout, refs);

      // Two flying actors: one at origin (station 0), one at destination (station 3)
      expect(refs.addedActors).toHaveLength(2);
      const [originFlyer, destFlyer] = refs.addedActors;

      // Origin station 0 is upper zone, so direction should be 'descend' (toward rail).
      // The flyer starts at topX/topY when descending.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Inspecting mock FlyingArtifactActor constructor config
      const originConfig = (originFlyer as { config: { pos: { x: number; y: number } } }).config;
      // Station 0 x = 150, chute topX = 150
      expect(originConfig.pos.x).toBe(150);

      // Destination station 3 is lower zone, so direction should be 'descend' (from rail toward lower).
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Inspecting mock FlyingArtifactActor constructor config
      const destConfig = (destFlyer as { config: { pos: { x: number; y: number } } }).config;
      // Station 3 x = 200, chute topX = 200
      expect(destConfig.pos.x).toBe(200);
    });

    it('walks the orchestrator to the destination station position', async () => {
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
        artifacts: { added: [{ stationIndex: 3, agentSlotIndex: 0, label: 'plan', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreographFloor(diff, layout, refs);

      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalledWith({ x: 200, y: 300 });
    });

    it('lands delivery artifacts at destination after delivery completes', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 3,
        agentSlotIndex: 0,
        label: 'plan',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 1, to: 3 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      expect(refs.addedArtifacts).toContain(artifact);
    });
  });

  describe('delivery with rail-level destination (no chute)', () => {
    it('creates no flying actors when destination is at rail level', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 2,
        agentSlotIndex: 0,
        label: 'code',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 1, to: 2 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Origin is upper (has chute) but destination is rail (no chute).
      // The hasChute check also requires hasChute at origin, but
      // the floor choreographer checks `hasChute && layout.hasChute(originStation)`.
      // Station 1 is upper, so hasChute(1) = true. But destZone is 'rail', so hasChute = false.
      // This means no flying actors at step 1, and no flying actors at step 4.
      expect(refs.addedActors).toHaveLength(0);
    });

    it('walks the orchestrator to the rail-level station', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 2,
        agentSlotIndex: 0,
        label: 'code',
        color: '#a5d8ff',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 1, to: 2 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();
      const layout = mockLayout();

      await choreographFloor(diff, layout, refs);

      // Coder at x=480, rail y=300
      expect(refs.orchestrator?.animateMoveTo).toHaveBeenCalledWith({ x: 480, y: 300 });
    });

    it('lands delivery artifacts at destination without flying animation', async () => {
      const artifact: StationArtifactConfig = {
        stationIndex: 6,
        agentSlotIndex: 0,
        label: 'summary',
        color: '#b2f2bb',
        slot: 'input',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 4, to: 6 } }),
        artifacts: { added: [artifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Summary (station 6) is at rail level: no flying actors
      expect(refs.addedActors).toHaveLength(0);
      expect(refs.addedArtifacts).toContain(artifact);
    });
  });

  describe('non-delivery artifacts during delivery', () => {
    it('adds non-delivery artifacts immediately while delivery is in progress', async () => {
      const deliveryArtifact: StationArtifactConfig = {
        stationIndex: 3,
        agentSlotIndex: 0,
        label: 'plan',
        color: '#a5d8ff',
        slot: 'input',
      };
      const outputArtifact: StationArtifactConfig = {
        stationIndex: 1,
        agentSlotIndex: 0,
        label: 'plan-doc',
        color: '#a5d8ff',
        slot: 'output',
      };
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 1, to: 3 } }),
        artifacts: { added: [deliveryArtifact, outputArtifact] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Both artifacts should end up in addedArtifacts
      expect(refs.addedArtifacts).toContain(deliveryArtifact);
      expect(refs.addedArtifacts).toContain(outputArtifact);
    });
  });

  describe('setCarriedArtifacts at step 5', () => {
    it('clears carried artifacts unconditionally at step 5 even when carriedChanged is null', async () => {
      const diff = floorDiff({
        orchestrator: orchestratorDiff({
          moved: { from: 0, to: 3 },
          carriedChanged: null,
        }),
        artifacts: { added: [{ stationIndex: 3, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Even without a carriedChanged diff, step 5 should unconditionally clear
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledTimes(1);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith([]);
    });

    it('calls setCarriedArtifacts twice during delivery when carriedChanged is set', async () => {
      const carried = [{ label: 'arch', color: '#a5d8ff' }];
      const diff = floorDiff({
        orchestrator: orchestratorDiff({
          moved: { from: 0, to: 3 },
          carriedChanged: { from: [], to: carried },
        }),
        artifacts: { added: [{ stationIndex: 3, agentSlotIndex: 0, label: 'arch', color: '#a5d8ff', slot: 'input' }] },
      });
      const refs = mockRefs();

      await choreographFloor(diff, mockLayout(), refs);

      // Once to pick up (step 2), once to clear (step 5)
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledTimes(2);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith(carried);
      expect(refs.orchestrator?.setCarriedArtifacts).toHaveBeenCalledWith([]);
    });
  });

  describe('undefined orchestrator', () => {
    it('does not throw when orchestrator is undefined', async () => {
      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
      });
      const refs = mockRefs({ orchestrator: undefined });

      await expect(choreographFloor(diff, mockLayout(), refs)).resolves.toBeUndefined();
    });

    it('still applies agent changes when orchestrator is undefined', async () => {
      const mockAgent = { animateToState: vi.fn() };
      const agents = new Map([['reviewer-1', mockAgent]]);
      const diff = floorDiff({
        agents: {
          stateChanged: [{ agentId: 'reviewer-1', from: 'idle', to: 'working' }],
          added: [],
          removed: [],
        },
      });
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- Test mock
      const refs = mockRefs({ orchestrator: undefined, agents: agents as unknown as FloorSceneRefs['agents'] });

      await choreographFloor(diff, mockLayout(), refs);

      expect(mockAgent.animateToState).toHaveBeenCalledWith('working');
    });
  });

  describe('animation error handling', () => {
    it('silently swallows known killed-actor rejections', async () => {
      using silent = silenceConsole(['error']);

      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
        artifacts: { added: [{ stationIndex: 3, agentSlotIndex: 0, label: 'plan', color: '#a5d8ff', slot: 'input' }] },
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

      await choreographFloor(diff, mockLayout(), refs);

      expect(silent.error).not.toHaveBeenCalled();
    });

    it('logs unexpected rejections via console.error', async () => {
      using silent = silenceConsole(['error']);

      const diff = floorDiff({
        orchestrator: orchestratorDiff({ moved: { from: 0, to: 3 } }),
        artifacts: { added: [{ stationIndex: 3, agentSlotIndex: 0, label: 'plan', color: '#a5d8ff', slot: 'input' }] },
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

      await choreographFloor(diff, mockLayout(), refs);

      expect(silent.error).toHaveBeenCalledWith('Unexpected animation error:', expect.any(Error));
    });
  });
});

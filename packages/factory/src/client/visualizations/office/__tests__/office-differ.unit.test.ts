import { describe, expect, it } from 'vitest';

import { diffOfficeConfigs } from '../state/office-differ.ts';
import type { OfficeAgentState, OfficeArtifactState, OfficeSceneConfig, OfficeZoneState } from '../types.ts';

/** Build a minimal OfficeSceneConfig. */
function config(overrides: Partial<OfficeSceneConfig> = {}): OfficeSceneConfig {
  return {
    orchestrator: {
      status: 'idle',
      carriedArtifacts: [],
      codeBadge: null,
      waiting: false,
      zoneId: 'governor',
      slotId: 'governor-desk-0',
    },
    agents: [],
    artifacts: [],
    zones: [
      { id: 'prep', active: false, completed: false },
      { id: 'workshop', active: false, completed: false },
      { id: 'governor', active: false, completed: false },
    ],
    ...overrides,
  };
}

function agent(overrides: Partial<OfficeAgentState> & { id: string }): OfficeAgentState {
  return {
    role: 'test',
    roleType: 'author',
    phase: 'implementation',
    status: 'idle',
    zoneId: 'workshop',
    slotId: 'workshop-desk-0',
    ...overrides,
  };
}

function artifact(overrides: Partial<OfficeArtifactState> & { id: string }): OfficeArtifactState {
  return {
    label: 'test',
    color: '#ff0000',
    status: 'created',
    producerPhase: 'implementation',
    zoneId: 'workshop',
    slotId: 'workshop-desk-0',
    ...overrides,
  };
}

describe(diffOfficeConfigs, () => {
  it('returns hasChanges false for identical configs', () => {
    const c = config();
    const diff = diffOfficeConfigs(c, c);
    expect(diff.hasChanges).toBe(false);
  });

  describe('orchestrator', () => {
    it('detects orchestrator zone movement', () => {
      const prev = config({
        orchestrator: { ...config().orchestrator, zoneId: 'governor', slotId: 'governor-desk-0' },
      });
      const next = config({
        orchestrator: { ...config().orchestrator, zoneId: 'workshop', slotId: 'workshop-standing-0' },
      });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.orchestrator.moved).toEqual({
        fromZone: 'governor',
        fromSlot: 'governor-desk-0',
        toZone: 'workshop',
        toSlot: 'workshop-standing-0',
      });
      expect(diff.hasChanges).toBe(true);
    });

    it('detects orchestrator slot change within the same zone', () => {
      const prev = config({
        orchestrator: { ...config().orchestrator, zoneId: 'governor', slotId: 'governor-desk-0' },
      });
      const next = config({
        orchestrator: { ...config().orchestrator, zoneId: 'governor', slotId: 'governor-desk-1' },
      });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.orchestrator.moved).toEqual({
        fromZone: 'governor',
        fromSlot: 'governor-desk-0',
        toZone: 'governor',
        toSlot: 'governor-desk-1',
      });
      expect(diff.hasChanges).toBe(true);
    });

    it('detects orchestrator status change', () => {
      const prev = config({ orchestrator: { ...config().orchestrator, status: 'idle' } });
      const next = config({ orchestrator: { ...config().orchestrator, status: 'dispatching' } });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.orchestrator.statusChanged).toEqual({ from: 'idle', to: 'dispatching' });
    });

    it('detects carried artifact changes', () => {
      const prev = config({ orchestrator: { ...config().orchestrator, carriedArtifacts: [] } });
      const next = config({
        orchestrator: {
          ...config().orchestrator,
          carriedArtifacts: [{ label: 'plan', color: '#00ff00' }],
        },
      });
      const diff = diffOfficeConfigs(prev, next);
      expect(diff.orchestrator.carriedChanged).not.toBeNull();
    });

    it('detects waiting state change', () => {
      const prev = config({ orchestrator: { ...config().orchestrator, waiting: false } });
      const next = config({ orchestrator: { ...config().orchestrator, waiting: true } });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.orchestrator.waitingChanged).toEqual({ from: false, to: true });
    });
  });

  describe('agents', () => {
    it('detects agent status changes', () => {
      const a = agent({ id: 'a1', status: 'idle' });
      const prev = config({ agents: [a] });
      const next = config({ agents: [{ ...a, status: 'working' }] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]?.statusChanged).toEqual({ from: 'idle', to: 'working' });
    });

    it('detects agent slot reassignment', () => {
      const a = agent({ id: 'a1', zoneId: 'workshop', slotId: 'workshop-desk-0' });
      const prev = config({ agents: [a] });
      const next = config({ agents: [{ ...a, zoneId: 'workshop', slotId: 'workshop-desk-1' }] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]?.moved).toEqual({
        fromZone: 'workshop',
        fromSlot: 'workshop-desk-0',
        toZone: 'workshop',
        toSlot: 'workshop-desk-1',
      });
    });

    it('detects newly added agents', () => {
      const prev = config({ agents: [] });
      const next = config({ agents: [agent({ id: 'new-agent' })] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]?.moved?.fromZone).toBe('');
    });

    it('detects removed agents', () => {
      const prev = config({ agents: [agent({ id: 'old-agent' })] });
      const next = config({ agents: [] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.agents).toHaveLength(1);
      expect(diff.agents[0]?.moved?.toZone).toBe('');
    });

    it('reports no changes for unchanged agents', () => {
      const a = agent({ id: 'a1' });
      const diff = diffOfficeConfigs(config({ agents: [a] }), config({ agents: [a] }));
      expect(diff.agents).toHaveLength(0);
    });
  });

  describe('artifacts', () => {
    it('detects newly added artifacts', () => {
      const prev = config({ artifacts: [] });
      const next = config({ artifacts: [artifact({ id: 'art1' })] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.artifacts.added).toHaveLength(1);
      expect(diff.artifacts.added[0]?.id).toBe('art1');
    });

    it('detects artifact status transitions', () => {
      const a = artifact({ id: 'art1', status: 'created' });
      const prev = config({ artifacts: [a] });
      const next = config({ artifacts: [{ ...a, status: 'delivered' }] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.artifacts.statusChanged).toHaveLength(1);
      expect(diff.artifacts.statusChanged[0]).toEqual({ artifactId: 'art1', from: 'created', to: 'delivered' });
    });

    it('detects removed artifacts', () => {
      const prev = config({ artifacts: [artifact({ id: 'art1' })] });
      const next = config({ artifacts: [] });
      const diff = diffOfficeConfigs(prev, next);

      expect(diff.artifacts.removed).toHaveLength(1);
    });
  });

  describe('zones', () => {
    it('detects zone active state change', () => {
      const prevZones: OfficeZoneState[] = [
        { id: 'prep', active: false, completed: false },
        { id: 'workshop', active: false, completed: false },
        { id: 'governor', active: false, completed: false },
      ];
      const nextZones: OfficeZoneState[] = [
        { id: 'prep', active: true, completed: false },
        { id: 'workshop', active: false, completed: false },
        { id: 'governor', active: false, completed: false },
      ];
      const diff = diffOfficeConfigs(config({ zones: prevZones }), config({ zones: nextZones }));

      expect(diff.zones).toContainEqual({ zoneId: 'prep', field: 'active', from: false, to: true });
    });

    it('detects zone completed state change', () => {
      const prevZones: OfficeZoneState[] = [
        { id: 'prep', active: true, completed: false },
        { id: 'workshop', active: false, completed: false },
        { id: 'governor', active: false, completed: false },
      ];
      const nextZones: OfficeZoneState[] = [
        { id: 'prep', active: false, completed: true },
        { id: 'workshop', active: false, completed: false },
        { id: 'governor', active: false, completed: false },
      ];
      const diff = diffOfficeConfigs(config({ zones: prevZones }), config({ zones: nextZones }));

      expect(diff.zones).toContainEqual({ zoneId: 'prep', field: 'active', from: true, to: false });
      expect(diff.zones).toContainEqual({ zoneId: 'prep', field: 'completed', from: false, to: true });
    });

    it('reports no zone changes when zones are identical', () => {
      const c = config();
      const diff = diffOfficeConfigs(c, c);
      expect(diff.zones).toHaveLength(0);
    });
  });
});

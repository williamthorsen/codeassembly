import { describe, expect, it } from 'vitest';

import type {
  AgentConfig,
  FactoryFloorSceneConfig,
  OrchestratorConfig,
  StationArtifactConfig,
  StationConfig,
} from '../../types.ts';
import { artifactKey, diffFactoryFloorConfig } from '../factory-floor-differ.ts';

function defaultOrchestrator(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    stationIndex: 0,
    working: false,
    celebrating: false,
    carriedArtifacts: [],
    codeBadge: null,
    ...overrides,
  };
}

function defaultStation(phase: StationConfig['phase']): StationConfig {
  return { phase, label: phase, color: '#fff', absent: false, skipped: false };
}

function defaultAgent(overrides: Partial<AgentConfig> & Pick<AgentConfig, 'id'>): AgentConfig {
  return {
    role: 'agent',
    roleType: 'author',
    stationIndex: 0,
    slotIndex: 0,
    state: 'idle',
    ...overrides,
  };
}

function buildConfig(overrides: Partial<FactoryFloorSceneConfig> = {}): FactoryFloorSceneConfig {
  return {
    orchestrator: defaultOrchestrator(),
    stations: [
      defaultStation('architecture'),
      defaultStation('planning'),
      defaultStation('implementation'),
      defaultStation('review'),
      defaultStation('simplifier'),
      defaultStation('holistic'),
      defaultStation('summary'),
    ],
    agents: [],
    artifacts: [],
    ...overrides,
  };
}

describe(diffFactoryFloorConfig, () => {
  it('reports hasChanges false when configs are identical', () => {
    const config = buildConfig({
      agents: [defaultAgent({ id: 'arch' })],
      artifacts: [{ stationIndex: 0, agentSlotIndex: 0, label: 'arch', color: '#f00', slot: 'output' }],
    });

    const diff = diffFactoryFloorConfig(config, config);

    expect(diff.hasChanges).toBe(false);
    expect(diff.orchestrator.moved).toBeNull();
    expect(diff.orchestrator.workingChanged).toBeNull();
    expect(diff.orchestrator.celebratingChanged).toBeNull();
    expect(diff.orchestrator.carriedChanged).toBeNull();
    expect(diff.orchestrator.codeBadgeChanged).toBeNull();
    expect(diff.agents.stateChanged).toHaveLength(0);
    expect(diff.agents.added).toHaveLength(0);
    expect(diff.agents.removed).toHaveLength(0);
    expect(diff.artifacts.added).toHaveLength(0);
  });

  describe('orchestrator diffing', () => {
    it('detects orchestrator station change with correct from/to', () => {
      const prev = buildConfig({ orchestrator: defaultOrchestrator({ stationIndex: 1 }) });
      const next = buildConfig({ orchestrator: defaultOrchestrator({ stationIndex: 3 }) });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.orchestrator.moved).toEqual({ from: 1, to: 3 });
      expect(diff.hasChanges).toBe(true);
    });

    it('detects working state change', () => {
      const prev = buildConfig({ orchestrator: defaultOrchestrator({ working: false }) });
      const next = buildConfig({ orchestrator: defaultOrchestrator({ working: true }) });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.orchestrator.workingChanged).toEqual({ from: false, to: true });
      expect(diff.hasChanges).toBe(true);
    });

    it('detects celebrating state change', () => {
      const prev = buildConfig({ orchestrator: defaultOrchestrator({ celebrating: false }) });
      const next = buildConfig({ orchestrator: defaultOrchestrator({ celebrating: true }) });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.orchestrator.celebratingChanged).toEqual({ from: false, to: true });
    });

    it('detects carried artifact change', () => {
      const prev = buildConfig({
        orchestrator: defaultOrchestrator({ carriedArtifacts: [{ label: 'plan', color: '#0f0' }] }),
      });
      const next = buildConfig({
        orchestrator: defaultOrchestrator({ carriedArtifacts: [{ label: 'code', color: '#00f' }] }),
      });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.orchestrator.carriedChanged).toEqual({
        from: [{ label: 'plan', color: '#0f0' }],
        to: [{ label: 'code', color: '#00f' }],
      });
    });

    it('detects code badge change', () => {
      const prev = buildConfig({ orchestrator: defaultOrchestrator({ codeBadge: null }) });
      const next = buildConfig({
        orchestrator: defaultOrchestrator({ codeBadge: { label: 'v2', color: '#ffaa00' } }),
      });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.orchestrator.codeBadgeChanged).toEqual({
        from: null,
        to: { label: 'v2', color: '#ffaa00' },
      });
    });
  });

  describe('agent diffing', () => {
    it('detects a new reviewer agent as added', () => {
      const prev = buildConfig({ agents: [defaultAgent({ id: 'reviewer-0' })] });
      const next = buildConfig({
        agents: [defaultAgent({ id: 'reviewer-0' }), defaultAgent({ id: 'reviewer-1', slotIndex: 1 })],
      });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.agents.added).toHaveLength(1);
      expect(diff.agents.added[0]?.id).toBe('reviewer-1');
      expect(diff.hasChanges).toBe(true);
    });

    it('detects a removed agent', () => {
      const prev = buildConfig({
        agents: [defaultAgent({ id: 'reviewer-0' }), defaultAgent({ id: 'reviewer-1', slotIndex: 1 })],
      });
      const next = buildConfig({ agents: [defaultAgent({ id: 'reviewer-0' })] });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.agents.removed).toHaveLength(1);
      expect(diff.agents.removed[0]?.id).toBe('reviewer-1');
      expect(diff.hasChanges).toBe(true);
    });

    it('detects agent state change', () => {
      const prev = buildConfig({ agents: [defaultAgent({ id: 'arch', state: 'idle' })] });
      const next = buildConfig({ agents: [defaultAgent({ id: 'arch', state: 'working' })] });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.agents.stateChanged).toHaveLength(1);
      expect(diff.agents.stateChanged[0]).toEqual({ agentId: 'arch', from: 'idle', to: 'working' });
    });

    it('reports no changes for unchanged agents', () => {
      const agents = [defaultAgent({ id: 'arch', state: 'idle' })];
      const prev = buildConfig({ agents });
      const next = buildConfig({ agents });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.agents.stateChanged).toHaveLength(0);
      expect(diff.agents.added).toHaveLength(0);
      expect(diff.agents.removed).toHaveLength(0);
    });
  });

  describe('artifact diffing', () => {
    it('detects newly added artifact', () => {
      const prev = buildConfig({ artifacts: [] });
      const art: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#f00',
        slot: 'output',
      };
      const next = buildConfig({ artifacts: [art] });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.artifacts.added).toHaveLength(1);
      expect(diff.artifacts.added[0]).toEqual(art);
      expect(diff.hasChanges).toBe(true);
    });

    it('does not include already-present artifacts in added list', () => {
      const art: StationArtifactConfig = {
        stationIndex: 0,
        agentSlotIndex: 0,
        label: 'arch',
        color: '#f00',
        slot: 'output',
      };
      const prev = buildConfig({ artifacts: [art] });
      const next = buildConfig({ artifacts: [art] });

      const diff = diffFactoryFloorConfig(prev, next);

      expect(diff.artifacts.added).toHaveLength(0);
    });
  });
});

describe(artifactKey, () => {
  it('produces a composite key from artifact fields', () => {
    const art: StationArtifactConfig = {
      stationIndex: 2,
      agentSlotIndex: 1,
      label: 'code',
      color: '#00f',
      slot: 'output',
      version: 3,
    };

    expect(artifactKey(art)).toBe('2:1:code:output:3');
  });

  it('treats version undefined and version 0 as the same identity', () => {
    const base: StationArtifactConfig = {
      stationIndex: 0,
      agentSlotIndex: 0,
      label: 'arch',
      color: '#f00',
      slot: 'output',
    };

    const withUndefined = artifactKey(base);
    const withZero = artifactKey({ ...base, version: 0 });

    expect(withUndefined).toBe(withZero);
    expect(withUndefined).toBe('0:0:arch:output:0');
  });

  it('distinguishes artifacts at different slots', () => {
    const base: StationArtifactConfig = {
      stationIndex: 0,
      agentSlotIndex: 0,
      label: 'arch',
      color: '#f00',
      slot: 'output',
    };

    const inputKey = artifactKey({ ...base, slot: 'input' });
    const outputKey = artifactKey(base);

    expect(inputKey).not.toBe(outputKey);
  });

  it('distinguishes artifacts with different versions', () => {
    const base: StationArtifactConfig = {
      stationIndex: 2,
      agentSlotIndex: 0,
      label: 'code',
      color: '#00f',
      slot: 'output',
    };

    const v1 = artifactKey({ ...base, version: 1 });
    const v2 = artifactKey({ ...base, version: 2 });

    expect(v1).not.toBe(v2);
  });
});

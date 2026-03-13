import { describe, expect, it } from 'vitest';

import type {
  AgentConfig,
  CatwalkSceneConfig,
  GateConfig,
  OrchestratorConfig,
  StationArtifactConfig,
  StationConfig,
} from '../../types.js';
import { diffAgents, diffArtifacts, diffCatwalkConfig, diffGates, diffOrchestrator } from '../catwalk-differ.js';

/** Minimal orchestrator config factory. */
function orchestrator(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    stationIndex: 0,
    working: false,
    celebrating: false,
    waiting: false,
    carriedArtifacts: [],
    codeBadge: null,
    ...overrides,
  };
}

describe('diffOrchestrator', () => {
  it('returns nulls when nothing changed', () => {
    const prev = orchestrator({ stationIndex: 2, working: true });
    const next = orchestrator({ stationIndex: 2, working: true });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toBeNull();
    expect(diff.workingChanged).toBeNull();
  });

  it('detects orchestrator moved forward', () => {
    const prev = orchestrator({ stationIndex: 1 });
    const next = orchestrator({ stationIndex: 3 });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 1, to: 3 });
  });

  it('detects orchestrator moved to completed position', () => {
    const prev = orchestrator({ stationIndex: 5 });
    const next = orchestrator({ stationIndex: 6 });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 5, to: 6 });
  });

  it('detects backward movement symmetrically', () => {
    const prev = orchestrator({ stationIndex: 3 });
    const next = orchestrator({ stationIndex: 1 });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 3, to: 1 });
  });

  it('detects working toggled on', () => {
    const prev = orchestrator({ working: false });
    const next = orchestrator({ working: true });
    const diff = diffOrchestrator(prev, next);

    expect(diff.workingChanged).toEqual({ from: false, to: true });
  });

  it('detects working toggled off', () => {
    const prev = orchestrator({ working: true });
    const next = orchestrator({ working: false });
    const diff = diffOrchestrator(prev, next);

    expect(diff.workingChanged).toEqual({ from: true, to: false });
  });

  it('detects both moved and working changed', () => {
    const prev = orchestrator({ stationIndex: 0, working: true });
    const next = orchestrator({ stationIndex: 2, working: false });
    const diff = diffOrchestrator(prev, next);

    expect(diff.moved).toEqual({ from: 0, to: 2 });
    expect(diff.workingChanged).toEqual({ from: true, to: false });
  });

  it('returns carriedChanged null when carried artifacts are identical', () => {
    const prev = orchestrator({ carriedArtifacts: [{ label: 'code', color: '#fff' }] });
    const next = orchestrator({ carriedArtifacts: [{ label: 'code', color: '#fff' }] });
    const diff = diffOrchestrator(prev, next);

    expect(diff.carriedChanged).toBeNull();
  });

  it('detects carried artifact additions', () => {
    const prev = orchestrator({ carriedArtifacts: [] });
    const carried = [{ label: 'code', color: '#fff3bf' }];
    const next = orchestrator({ carriedArtifacts: carried });
    const diff = diffOrchestrator(prev, next);

    expect(diff.carriedChanged).toEqual({ from: [], to: carried });
  });

  it('detects carried artifact removals', () => {
    const carried = [{ label: 'code', color: '#fff3bf' }];
    const prev = orchestrator({ carriedArtifacts: carried });
    const next = orchestrator({ carriedArtifacts: [] });
    const diff = diffOrchestrator(prev, next);

    expect(diff.carriedChanged).toEqual({ from: carried, to: [] });
  });

  it('detects carried artifact reordering', () => {
    const a = { label: 'code', color: '#fff3bf' };
    const b = { label: 'plan', color: '#b2f2bb' };
    const prev = orchestrator({ carriedArtifacts: [a, b] });
    const next = orchestrator({ carriedArtifacts: [b, a] });
    const diff = diffOrchestrator(prev, next);

    expect(diff.carriedChanged).not.toBeNull();
  });

  it('returns codeBadgeChanged null when badges are identical', () => {
    const badge = { label: 'v2', color: '#ffaa00' };
    const prev = orchestrator({ codeBadge: badge });
    const next = orchestrator({ codeBadge: { label: 'v2', color: '#ffaa00' } });
    const diff = diffOrchestrator(prev, next);

    expect(diff.codeBadgeChanged).toBeNull();
  });

  it('detects code badge appearance', () => {
    const prev = orchestrator({ codeBadge: null });
    const badge = { label: 'v2', color: '#ffaa00' };
    const next = orchestrator({ codeBadge: badge });
    const diff = diffOrchestrator(prev, next);

    expect(diff.codeBadgeChanged).toEqual({ from: null, to: badge });
  });

  it('detects code badge disappearance', () => {
    const badge = { label: 'v2', color: '#ffaa00' };
    const prev = orchestrator({ codeBadge: badge });
    const next = orchestrator({ codeBadge: null });
    const diff = diffOrchestrator(prev, next);

    expect(diff.codeBadgeChanged).toEqual({ from: badge, to: null });
  });

  it('detects code badge label change', () => {
    const prev = orchestrator({ codeBadge: { label: 'v2', color: '#ffaa00' } });
    const next = orchestrator({ codeBadge: { label: 'v3', color: '#ffaa00' } });
    const diff = diffOrchestrator(prev, next);

    expect(diff.codeBadgeChanged).not.toBeNull();
  });

  it('detects celebrating transition from false to true', () => {
    const prev = orchestrator({ celebrating: false });
    const next = orchestrator({ celebrating: true });
    const diff = diffOrchestrator(prev, next);

    expect(diff.celebratingChanged).toEqual({ from: false, to: true });
  });

  it('returns celebratingChanged null when celebrating is unchanged', () => {
    const prev = orchestrator({ celebrating: false });
    const next = orchestrator({ celebrating: false });
    const diff = diffOrchestrator(prev, next);

    expect(diff.celebratingChanged).toBeNull();
  });
});

/** Minimal agent config factory. */
function agent(id: string, overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id,
    role: id,
    roleType: 'author',
    stationIndex: 0,
    slotIndex: 0,
    state: 'idle',
    ...overrides,
  };
}

describe('diffAgents', () => {
  it('returns empty arrays when nothing changed', () => {
    const agents = [agent('arch', { state: 'working' })];
    const diff = diffAgents(agents, agents);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects a single agent state change', () => {
    const prev = [agent('arch', { state: 'working' })];
    const next = [agent('arch', { state: 'resting' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([{ agentId: 'arch', from: 'working', to: 'resting' }]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('detects multiple agent state changes', () => {
    const prev = [agent('arch', { state: 'working' }), agent('coder', { state: 'idle' })];
    const next = [agent('arch', { state: 'resting' }), agent('coder', { state: 'working' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toHaveLength(2);
    expect(diff.stateChanged[0]).toEqual({ agentId: 'arch', from: 'working', to: 'resting' });
    expect(diff.stateChanged[1]).toEqual({ agentId: 'coder', from: 'idle', to: 'working' });
  });

  it('detects an added agent', () => {
    const prev = [agent('arch')];
    const reviewer = agent('reviewer-0', { stationIndex: 3 });
    const next = [agent('arch'), reviewer];
    const diff = diffAgents(prev, next);

    expect(diff.added).toEqual([reviewer]);
    expect(diff.removed).toEqual([]);
    expect(diff.stateChanged).toEqual([]);
  });

  it('detects a removed agent', () => {
    const reviewer = agent('reviewer-0', { stationIndex: 3 });
    const prev = [agent('arch'), reviewer];
    const next = [agent('arch')];
    const diff = diffAgents(prev, next);

    expect(diff.removed).toEqual([reviewer]);
    expect(diff.added).toEqual([]);
    expect(diff.stateChanged).toEqual([]);
  });

  it('handles mixed add, remove, and state change', () => {
    const prev = [agent('arch', { state: 'working' }), agent('reviewer-0', { state: 'idle' })];
    const next = [agent('arch', { state: 'resting' }), agent('reviewer-1', { state: 'working', slotIndex: 1 })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([{ agentId: 'arch', from: 'working', to: 'resting' }]);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]?.id).toBe('reviewer-1');
    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]?.id).toBe('reviewer-0');
  });

  it('returns empty arrays when both inputs are empty', () => {
    const diff = diffAgents([], []);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('ignores slotIndex changes when state is unchanged', () => {
    const prev = [agent('reviewer-0', { slotIndex: 0, state: 'working' })];
    const next = [agent('reviewer-0', { slotIndex: 1, state: 'working' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});

/** Minimal gate config factory. */
function gate(left: number, right: number, open = false): GateConfig {
  return { betweenStations: [left, right], open };
}

describe('diffGates', () => {
  it('returns empty array when nothing changed', () => {
    const gates = [gate(0, 1, false), gate(1, 2, true)];
    const diff = diffGates(gates, gates);

    expect(diff.opened).toEqual([]);
  });

  it('detects a single gate opened', () => {
    const prev = [gate(0, 1, false), gate(1, 2, false)];
    const next = [gate(0, 1, true), gate(1, 2, false)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([{ betweenStations: [0, 1], open: true }]);
  });

  it('detects multiple gates opened', () => {
    const prev = [gate(0, 1, false), gate(1, 2, false), gate(2, 3, false)];
    const next = [gate(0, 1, true), gate(1, 2, true), gate(2, 3, false)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toHaveLength(2);
    expect(diff.opened[0]?.betweenStations).toEqual([0, 1]);
    expect(diff.opened[1]?.betweenStations).toEqual([1, 2]);
  });

  it('ignores gates that were already open', () => {
    const prev = [gate(0, 1, true), gate(1, 2, true)];
    const next = [gate(0, 1, true), gate(1, 2, true)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([]);
  });

  it('does not report a gate closing (open to closed) as opened', () => {
    const prev = [gate(0, 1, true)];
    const next = [gate(0, 1, false)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([]);
  });

  it('skips gates at new indices — a gate added by a phase change has no prior state to diff', () => {
    const prev: GateConfig[] = [];
    const next = [gate(0, 1, true)];
    const diff = diffGates(prev, next);

    expect(diff.opened).toEqual([]);
  });
});

/** Minimal station artifact config factory. */
function artifact(
  stationIndex: number,
  label: string,
  overrides: Partial<StationArtifactConfig> = {},
): StationArtifactConfig {
  return {
    stationIndex,
    agentSlotIndex: 0,
    label,
    color: '#ffffff',
    slot: 'output',
    ...overrides,
  };
}

describe('diffArtifacts', () => {
  it('returns empty array when nothing changed', () => {
    const artifacts = [artifact(0, 'architecture')];
    const diff = diffArtifacts(artifacts, artifacts);

    expect(diff.added).toEqual([]);
  });

  it('detects a single artifact added', () => {
    const prev: StationArtifactConfig[] = [];
    const newArtifact = artifact(0, 'architecture');
    const next = [newArtifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([newArtifact]);
  });

  it('detects multiple artifacts added at different stations', () => {
    const prev = [artifact(0, 'architecture')];
    const planArtifact = artifact(1, 'plan');
    const codeArtifact = artifact(2, 'code');
    const next = [artifact(0, 'architecture'), planArtifact, codeArtifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toHaveLength(2);
    expect(diff.added).toEqual([planArtifact, codeArtifact]);
  });

  it('detects artifact with version bump as new', () => {
    const prev = [artifact(2, 'code', { version: 1 })];
    const v2Artifact = artifact(2, 'code', { version: 2 });
    const next = [artifact(2, 'code', { version: 1 }), v2Artifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([v2Artifact]);
  });

  it('treats artifacts without version as version 0 for identity', () => {
    const prev = [artifact(0, 'architecture')];
    const next = [artifact(0, 'architecture')];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([]);
  });

  it('distinguishes artifacts at the same station with same label but different slots', () => {
    const outputArtifact = artifact(0, 'code', { slot: 'output' });
    const inputArtifact = artifact(0, 'code', { slot: 'input' });
    const prev = [outputArtifact];
    const next = [outputArtifact, inputArtifact];
    const diff = diffArtifacts(prev, next);

    expect(diff.added).toEqual([inputArtifact]);
  });
});

/** Minimal station config factory. */
function station(phase: StationConfig['phase']): StationConfig {
  return { phase, label: phase, color: '#888', absent: false, skipped: false };
}

/** Minimal full scene config factory. */
function sceneConfig(overrides: Partial<CatwalkSceneConfig> = {}): CatwalkSceneConfig {
  return {
    orchestrator: orchestrator(),
    stations: [station('architecture'), station('planning')],
    agents: [agent('arch')],
    gates: [gate(0, 1, false)],
    artifacts: [],
    ...overrides,
  };
}

describe('diffCatwalkConfig', () => {
  it('returns hasChanges false when configs are identical', () => {
    const config = sceneConfig();
    const diff = diffCatwalkConfig(config, config);

    expect(diff.hasChanges).toBe(false);
    expect(diff.orchestrator.moved).toBeNull();
    expect(diff.orchestrator.workingChanged).toBeNull();
    expect(diff.agents.stateChanged).toEqual([]);
    expect(diff.agents.added).toEqual([]);
    expect(diff.agents.removed).toEqual([]);
    expect(diff.gates.opened).toEqual([]);
    expect(diff.artifacts.added).toEqual([]);
  });

  it('returns hasChanges true when orchestrator moved', () => {
    const prev = sceneConfig({ orchestrator: orchestrator({ stationIndex: 0 }) });
    const next = sceneConfig({ orchestrator: orchestrator({ stationIndex: 1 }) });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.moved).toEqual({ from: 0, to: 1 });
  });

  it('returns hasChanges true when an agent state changes', () => {
    const prev = sceneConfig({ agents: [agent('arch', { state: 'working' })] });
    const next = sceneConfig({ agents: [agent('arch', { state: 'resting' })] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.agents.stateChanged).toHaveLength(1);
  });

  it('returns hasChanges true when an agent is added', () => {
    const prev = sceneConfig();
    const next = sceneConfig({ agents: [agent('arch'), agent('reviewer-0', { stationIndex: 3 })] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.agents.added).toHaveLength(1);
  });

  it('returns hasChanges true when an agent is removed', () => {
    const prev = sceneConfig({ agents: [agent('arch'), agent('reviewer-0', { stationIndex: 3 })] });
    const next = sceneConfig();
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.agents.removed).toHaveLength(1);
  });

  it('returns hasChanges true when a gate opens', () => {
    const prev = sceneConfig({ gates: [gate(0, 1, false)] });
    const next = sceneConfig({ gates: [gate(0, 1, true)] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.gates.opened).toHaveLength(1);
  });

  it('returns hasChanges true when an artifact is added', () => {
    const newArtifact = artifact(0, 'architecture');
    const prev = sceneConfig({ artifacts: [] });
    const next = sceneConfig({ artifacts: [newArtifact] });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.artifacts.added).toEqual([newArtifact]);
  });

  it('returns hasChanges true when carried artifacts change', () => {
    const prev = sceneConfig({ orchestrator: orchestrator({ carriedArtifacts: [] }) });
    const next = sceneConfig({
      orchestrator: orchestrator({ carriedArtifacts: [{ label: 'code', color: '#fff3bf' }] }),
    });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.carriedChanged).not.toBeNull();
  });

  it('returns hasChanges true when code badge changes', () => {
    const prev = sceneConfig({ orchestrator: orchestrator({ codeBadge: null }) });
    const next = sceneConfig({
      orchestrator: orchestrator({ codeBadge: { label: 'v2', color: '#ffaa00' } }),
    });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.codeBadgeChanged).not.toBeNull();
  });

  it('returns hasChanges true when orchestrator transitions to celebrating', () => {
    const prev = sceneConfig({ orchestrator: orchestrator({ celebrating: false }) });
    const next = sceneConfig({ orchestrator: orchestrator({ celebrating: true }) });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.celebratingChanged).toEqual({ from: false, to: true });
  });

  it('detects changes across all sub-diffs simultaneously', () => {
    const prev = sceneConfig({
      orchestrator: orchestrator({ stationIndex: 0, working: true }),
      agents: [agent('arch', { state: 'working' })],
      gates: [gate(0, 1, false)],
      artifacts: [],
    });
    const next = sceneConfig({
      orchestrator: orchestrator({ stationIndex: 1, working: false }),
      agents: [agent('arch', { state: 'resting' })],
      gates: [gate(0, 1, true)],
      artifacts: [artifact(0, 'architecture')],
    });
    const diff = diffCatwalkConfig(prev, next);

    expect(diff.hasChanges).toBe(true);
    expect(diff.orchestrator.moved).not.toBeNull();
    expect(diff.orchestrator.workingChanged).not.toBeNull();
    expect(diff.agents.stateChanged).toHaveLength(1);
    expect(diff.gates.opened).toHaveLength(1);
    expect(diff.artifacts.added).toHaveLength(1);
  });
});

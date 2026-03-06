import { describe, expect, it } from 'vitest';

import type { AgentConfig, OrchestratorConfig } from '../../types.js';
import { diffAgents, diffOrchestrator } from '../catwalk-differ.js';

/** Minimal orchestrator config factory. */
function orchestrator(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    stationIndex: 0,
    working: false,
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

  it('ignores slotIndex changes when state is unchanged', () => {
    const prev = [agent('reviewer-0', { slotIndex: 0, state: 'working' })];
    const next = [agent('reviewer-0', { slotIndex: 1, state: 'working' })];
    const diff = diffAgents(prev, next);

    expect(diff.stateChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});

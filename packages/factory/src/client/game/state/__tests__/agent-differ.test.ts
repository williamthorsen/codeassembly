import { describe, expect, it } from 'vitest';

import type { AgentConfig } from '../../mappers/run-to-scene.js';
import { diffAgents } from '../agent-differ.js';

function createAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    role: 'architect',
    roleType: 'analyst',
    stationIndex: 0,
    stackOffset: 0,
    level: 0,
    ...overrides,
  };
}

describe('diffAgents', () => {
  it('returns empty diff when both arrays are empty', () => {
    const result = diffAgents([], []);

    expect(result).toEqual({ added: [], removed: [], moved: [], unchanged: [] });
  });

  it('marks all agents as added when prev is empty', () => {
    const next = [
      createAgent({ role: 'architect', stationIndex: 0 }),
      createAgent({ role: 'planner', roleType: 'planner', stationIndex: 1 }),
    ];

    const result = diffAgents([], next);

    expect(result.added).toEqual(next);
    expect(result.removed).toEqual([]);
    expect(result.moved).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('marks all agents as removed when next is empty', () => {
    const prev = [
      createAgent({ role: 'architect', stationIndex: 0 }),
      createAgent({ role: 'planner', roleType: 'planner', stationIndex: 1 }),
    ];

    const result = diffAgents(prev, []);

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual(prev);
    expect(result.moved).toEqual([]);
    expect(result.unchanged).toEqual([]);
  });

  it('marks agents as unchanged when position is identical', () => {
    const agent = createAgent({ role: 'architect', stationIndex: 0 });

    const result = diffAgents([agent], [agent]);

    expect(result.unchanged).toEqual([agent]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.moved).toEqual([]);
  });

  it('marks agent as moved when stationIndex changes', () => {
    const prev = createAgent({ role: 'architect', stationIndex: 0 });
    const next = createAgent({ role: 'architect', stationIndex: 2 });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toEqual([{ prev, next }]);
    expect(result.unchanged).toEqual([]);
  });

  it('marks agent as moved when stackOffset changes', () => {
    const prev = createAgent({ role: 'reviewer-a', roleType: 'reviewer', stationIndex: 3, stackOffset: 0 });
    const next = createAgent({ role: 'reviewer-a', roleType: 'reviewer', stationIndex: 3, stackOffset: 1 });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toEqual([{ prev, next }]);
  });

  it('categorizes mixed additions, removals, moves, and unchanged', () => {
    const prevAgents = [
      createAgent({ role: 'architect', stationIndex: 0 }),
      createAgent({ role: 'planner', roleType: 'planner', stationIndex: 1 }),
      createAgent({ role: 'coder', roleType: 'author', stationIndex: 2 }),
    ];
    const nextAgents = [
      createAgent({ role: 'architect', stationIndex: 0 }),
      createAgent({ role: 'planner', roleType: 'planner', stationIndex: 3 }),
      createAgent({ role: 'reviewer', roleType: 'reviewer', stationIndex: 3 }),
    ];

    const result = diffAgents(prevAgents, nextAgents);

    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]?.role).toBe('architect');

    expect(result.moved).toHaveLength(1);
    expect(result.moved[0]?.next.role).toBe('planner');

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]?.role).toBe('coder');

    expect(result.added).toHaveLength(1);
    expect(result.added[0]?.role).toBe('reviewer');
  });

  it('marks agent as moved when level changes from 0 to 1', () => {
    const prev = createAgent({ role: 'reviewer-a', roleType: 'reviewer', stationIndex: 3, stackOffset: 0, level: 0 });
    const next = createAgent({ role: 'reviewer-a', roleType: 'reviewer', stationIndex: 3, stackOffset: 0, level: 1 });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toEqual([{ prev, next }]);
  });

  it('marks agent as moved when level changes from 1 to 2', () => {
    const prev = createAgent({ role: 'reviewer-b', roleType: 'reviewer', stationIndex: 3, stackOffset: 1, level: 1 });
    const next = createAgent({ role: 'reviewer-b', roleType: 'reviewer', stationIndex: 3, stackOffset: 1, level: 2 });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toEqual([{ prev, next }]);
  });

  it('marks agent as unchanged when level is the same', () => {
    const agent = createAgent({ role: 'reviewer-a', roleType: 'reviewer', stationIndex: 3, stackOffset: 0, level: 1 });

    const result = diffAgents([agent], [agent]);

    expect(result.unchanged).toEqual([agent]);
    expect(result.moved).toEqual([]);
  });

  it('marks agent as moved when approaching changes from true to undefined', () => {
    const prev = createAgent({
      role: 'orchestrator',
      roleType: 'orchestrator',
      stationIndex: 1,
      stackOffset: 0,
      level: 0,
      approaching: true,
    });
    const next = createAgent({
      role: 'orchestrator',
      roleType: 'orchestrator',
      stationIndex: 1,
      stackOffset: 0,
      level: 0,
    });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
  });

  it('marks agent as moved when approaching changes from undefined to true', () => {
    const prev = createAgent({
      role: 'orchestrator',
      roleType: 'orchestrator',
      stationIndex: 1,
      stackOffset: 0,
      level: 0,
    });
    const next = createAgent({
      role: 'orchestrator',
      roleType: 'orchestrator',
      stationIndex: 1,
      stackOffset: 0,
      level: 0,
      approaching: true,
    });

    const result = diffAgents([prev], [next]);

    expect(result.moved).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
  });

  it('treats roleType changes as unchanged when position is the same', () => {
    const prev = createAgent({ role: 'agent-x', roleType: 'analyst', stationIndex: 0 });
    const next = createAgent({ role: 'agent-x', roleType: 'planner', stationIndex: 0 });

    const result = diffAgents([prev], [next]);

    // roleType change does not constitute a move; only position matters
    expect(result.unchanged).toHaveLength(1);
    expect(result.moved).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';

import type { LogicalAgentState, LogicalArtifactState, LogicalSceneState } from '../../shared/types.js';
import { mapLogicalToOffice } from '../mappers/logical-to-office.js';

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

function agent(overrides: Partial<LogicalAgentState> & { id: string }): LogicalAgentState {
  return {
    role: 'test',
    roleType: 'author',
    phase: 'implementation',
    status: 'idle',
    ...overrides,
  };
}

function artifact(overrides: Partial<LogicalArtifactState> & { id: string }): LogicalArtifactState {
  return {
    label: 'test',
    color: '#ff0000',
    status: 'created',
    producerPhase: 'implementation',
    ...overrides,
  };
}

describe(mapLogicalToOffice, () => {
  it('handles empty state gracefully', () => {
    const result = mapLogicalToOffice(logicalScene());

    expect(result.agents).toHaveLength(0);
    expect(result.artifacts).toHaveLength(0);
    expect(result.zones).toHaveLength(3);
    expect(result.orchestrator.zoneId).toBe('governor');
  });

  it('assigns architect and planner to prep zone', () => {
    const scene = logicalScene({
      agents: [
        agent({ id: 'architect', phase: 'architecture', roleType: 'analyst' }),
        agent({ id: 'planner', phase: 'planning', roleType: 'planner' }),
      ],
    });
    const result = mapLogicalToOffice(scene);

    const arch = result.agents.find((a) => a.id === 'architect');
    const plan = result.agents.find((a) => a.id === 'planner');

    expect(arch).toBeDefined();
    expect(arch?.zoneId).toBe('prep');
    expect(arch?.slotId).toBe('prep-desk-0');

    expect(plan).toBeDefined();
    expect(plan?.zoneId).toBe('prep');
    expect(plan?.slotId).toBe('prep-desk-1');
  });

  it('assigns coder to workshop/workshop-desk-0', () => {
    const scene = logicalScene({
      agents: [agent({ id: 'coder', phase: 'implementation', roleType: 'author' })],
    });
    const result = mapLogicalToOffice(scene);
    const coder = result.agents.find((a) => a.id === 'coder');

    expect(coder?.zoneId).toBe('workshop');
    expect(coder?.slotId).toBe('workshop-desk-0');
  });

  it('assigns reviewers to workshop/workshop-desk-1 through ws-5', () => {
    const scene = logicalScene({
      agents: [
        agent({ id: 'rev-a', phase: 'review', roleType: 'reviewer' }),
        agent({ id: 'rev-b', phase: 'review', roleType: 'reviewer' }),
        agent({ id: 'rev-c', phase: 'review', roleType: 'reviewer' }),
      ],
    });
    const result = mapLogicalToOffice(scene);
    const reviewers = result.agents.filter((a) => a.phase === 'review');

    expect(reviewers).toHaveLength(3);
    const slotIds = new Set(reviewers.map((r) => r.slotId));
    // All should be workshop-desk-1 through ws-3
    expect(slotIds).toContain('workshop-desk-1');
    expect(slotIds).toContain('workshop-desk-2');
    expect(slotIds).toContain('workshop-desk-3');
  });

  it('places orchestrator at prep when dispatching to architecture', () => {
    const scene = logicalScene({
      currentPhase: 'architecture',
      orchestrator: { status: 'dispatching', carriedArtifacts: [], codeBadge: null, waiting: false },
    });
    const result = mapLogicalToOffice(scene);
    expect(result.orchestrator.zoneId).toBe('prep');
  });

  it('places orchestrator at workshop when monitoring implementation', () => {
    const scene = logicalScene({
      currentPhase: 'implementation',
      orchestrator: { status: 'monitoring', carriedArtifacts: [], codeBadge: null, waiting: false },
    });
    const result = mapLogicalToOffice(scene);
    expect(result.orchestrator.zoneId).toBe('workshop');
  });

  it('places orchestrator at governor when idle', () => {
    const scene = logicalScene({
      orchestrator: { status: 'idle', carriedArtifacts: [], codeBadge: null, waiting: false },
    });
    const result = mapLogicalToOffice(scene);
    expect(result.orchestrator.zoneId).toBe('governor');
  });

  it('places orchestrator at governor when done', () => {
    const scene = logicalScene({
      orchestrator: { status: 'done', carriedArtifacts: [], codeBadge: null, waiting: false },
    });
    const result = mapLogicalToOffice(scene);
    expect(result.orchestrator.zoneId).toBe('governor');
  });

  it('places orchestrator at governor when delivering', () => {
    const scene = logicalScene({
      orchestrator: { status: 'delivering', carriedArtifacts: [], codeBadge: null, waiting: false },
    });
    const result = mapLogicalToOffice(scene);
    expect(result.orchestrator.zoneId).toBe('governor');
  });

  it('places delivered artifacts at governor storage', () => {
    const scene = logicalScene({
      artifacts: [
        artifact({ id: 'a1', status: 'delivered', producerPhase: 'architecture' }),
        artifact({ id: 'a2', status: 'delivered', producerPhase: 'planning' }),
      ],
    });
    const result = mapLogicalToOffice(scene);

    expect(result.artifacts[0]?.zoneId).toBe('governor');
    expect(result.artifacts[0]?.slotId).toBe('governor-storage-0');
    expect(result.artifacts[1]?.zoneId).toBe('governor');
    expect(result.artifacts[1]?.slotId).toBe('governor-storage-1');
  });

  it('places in_transit artifacts at their producer zone', () => {
    const scene = logicalScene({
      artifacts: [artifact({ id: 'a1', status: 'in_transit', producerPhase: 'implementation' })],
    });
    const result = mapLogicalToOffice(scene);

    expect(result.artifacts[0]?.zoneId).toBe('workshop');
    expect(result.artifacts[0]?.slotId).toBe('workshop-desk-0');
  });

  it('derives correct zone states from agent statuses', () => {
    const scene = logicalScene({
      agents: [
        agent({ id: 'a1', phase: 'implementation', status: 'working' }),
        agent({ id: 'a2', phase: 'implementation', status: 'idle' }),
      ],
    });
    const result = mapLogicalToOffice(scene);

    const workshop = result.zones.find((z) => z.id === 'workshop');
    expect(workshop?.active).toBe(true);
    expect(workshop?.completed).toBe(false);

    // Prep has no agents: neither active nor completed
    const prep = result.zones.find((z) => z.id === 'prep');
    expect(prep?.active).toBe(false);
    expect(prep?.completed).toBe(false);
  });
});

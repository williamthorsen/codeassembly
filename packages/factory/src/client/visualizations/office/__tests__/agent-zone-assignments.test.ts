import { describe, expect, it } from 'vitest';

import type { LogicalAgentState, LogicalArtifactState, LogicalOrchestratorState } from '../../shared/types.js';
import { ZONE_DEFINITIONS } from '../constants/zone-definitions.js';
import {
  assignAgentToZone,
  assignArtifactToZone,
  buildArtifactStates,
  computeReviewerIndices,
  deriveOrchestratorZone,
  deriveZoneStates,
} from '../mappers/agent-zone-assignments.js';
import type { OfficeAgentState } from '../types.js';

/** Minimal agent factory. */
function agent(overrides: Partial<LogicalAgentState> & { id: string }): LogicalAgentState {
  return {
    role: 'test-agent',
    roleType: 'author',
    phase: 'implementation',
    status: 'idle',
    ...overrides,
  };
}

/** Minimal orchestrator factory. */
function orchestrator(overrides: Partial<LogicalOrchestratorState> = {}): LogicalOrchestratorState {
  return {
    status: 'idle',
    carriedArtifacts: [],
    codeBadge: null,
    waiting: false,
    ...overrides,
  };
}

/** Minimal artifact factory. */
function artifact(overrides: Partial<LogicalArtifactState> & { id: string }): LogicalArtifactState {
  return {
    label: 'test-artifact',
    color: '#ff0000',
    status: 'created',
    producerPhase: 'implementation',
    ...overrides,
  };
}

describe(assignAgentToZone, () => {
  it('assigns architect to prep/prep-ws-0', () => {
    const result = assignAgentToZone(agent({ id: 'arch', phase: 'architecture', roleType: 'analyst' }), 0);
    expect(result).toEqual({ zoneId: 'prep', slotId: 'prep-ws-0' });
  });

  it('assigns planner to prep/prep-ws-1', () => {
    const result = assignAgentToZone(agent({ id: 'plan', phase: 'planning', roleType: 'planner' }), 0);
    expect(result).toEqual({ zoneId: 'prep', slotId: 'prep-ws-1' });
  });

  it('assigns coder to workshop/workshop-ws-0', () => {
    const result = assignAgentToZone(agent({ id: 'code', phase: 'implementation', roleType: 'author' }), 0);
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-0' });
  });

  it('assigns reviewers to workshop/workshop-ws-{index}', () => {
    const result = assignAgentToZone(agent({ id: 'rev1', phase: 'review', roleType: 'reviewer' }), 1);
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-1' });
  });

  it('caps reviewer slot index at 5', () => {
    const result = assignAgentToZone(agent({ id: 'rev6', phase: 'review', roleType: 'reviewer' }), 10);
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-5' });
  });

  it('assigns simplifier to workshop', () => {
    const result = assignAgentToZone(agent({ id: 'simp', phase: 'simplifier', roleType: 'reviewer' }), 2);
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-2' });
  });

  it('assigns holistic reviewer to workshop', () => {
    const result = assignAgentToZone(agent({ id: 'hol', phase: 'holistic', roleType: 'reviewer' }), 3);
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-3' });
  });
});

describe(deriveOrchestratorZone, () => {
  it('returns governor when idle', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'idle' }), undefined)).toBe('governor');
  });

  it('returns governor when done', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'done' }), undefined)).toBe('governor');
  });

  it('returns governor when delivering', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'delivering' }), undefined)).toBe('governor');
  });

  it('returns prep when dispatching to architecture phase', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'dispatching' }), 'architecture')).toBe('prep');
  });

  it('returns prep when dispatching to planning phase', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'dispatching' }), 'planning')).toBe('prep');
  });

  it('returns workshop when monitoring implementation phase', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'monitoring' }), 'implementation')).toBe('workshop');
  });

  it('returns workshop when dispatching to review phase', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'dispatching' }), 'review')).toBe('workshop');
  });

  it('returns governor when dispatching with no current phase', () => {
    expect(deriveOrchestratorZone(orchestrator({ status: 'dispatching' }), undefined)).toBe('governor');
  });
});

describe(assignArtifactToZone, () => {
  it('assigns delivered artifacts to governor storage slots', () => {
    const result = assignArtifactToZone(artifact({ id: 'a1', status: 'delivered' }), 0);
    expect(result).toEqual({ zoneId: 'governor', slotId: 'governor-storage-0' });
  });

  it('cycles through storage slots for multiple delivered artifacts', () => {
    const r0 = assignArtifactToZone(artifact({ id: 'a1', status: 'delivered' }), 0);
    const r1 = assignArtifactToZone(artifact({ id: 'a2', status: 'delivered' }), 1);
    const r2 = assignArtifactToZone(artifact({ id: 'a3', status: 'delivered' }), 2);
    const r3 = assignArtifactToZone(artifact({ id: 'a4', status: 'delivered' }), 3);

    expect(r0.slotId).toBe('governor-storage-0');
    expect(r1.slotId).toBe('governor-storage-1');
    expect(r2.slotId).toBe('governor-storage-2');
    expect(r3.slotId).toBe('governor-storage-0');
  });

  it('assigns created artifacts to their producer zone', () => {
    const result = assignArtifactToZone(artifact({ id: 'a1', status: 'created', producerPhase: 'architecture' }), 0);
    expect(result).toEqual({ zoneId: 'prep', slotId: 'prep-ws-0' });
  });

  it('assigns in_transit artifacts to their producer zone (same as created)', () => {
    const result = assignArtifactToZone(
      artifact({ id: 'a1', status: 'in_transit', producerPhase: 'implementation' }),
      0,
    );
    expect(result).toEqual({ zoneId: 'workshop', slotId: 'workshop-ws-0' });
  });
});

describe(deriveZoneStates, () => {
  /** Minimal office agent factory. */
  function officeAgent(overrides: Partial<OfficeAgentState> & { id: string; zoneId: string }): OfficeAgentState {
    return {
      role: 'test',
      roleType: 'author',
      phase: 'implementation',
      status: 'idle',
      slotId: 'test-slot',
      ...overrides,
    };
  }

  it('marks a zone as active when any agent is working', () => {
    const agents: OfficeAgentState[] = [
      officeAgent({ id: 'a1', zoneId: 'workshop', status: 'working' }),
      officeAgent({ id: 'a2', zoneId: 'workshop', status: 'idle' }),
    ];
    const states = deriveZoneStates(agents, ZONE_DEFINITIONS);
    const workshop = states.find((z) => z.id === 'workshop');
    expect(workshop).toEqual({ id: 'workshop', active: true, completed: false });
  });

  it('marks a zone as completed when all agents are done', () => {
    const agents: OfficeAgentState[] = [
      officeAgent({ id: 'a1', zoneId: 'prep', status: 'done' }),
      officeAgent({ id: 'a2', zoneId: 'prep', status: 'done' }),
    ];
    const states = deriveZoneStates(agents, ZONE_DEFINITIONS);
    const prep = states.find((z) => z.id === 'prep');
    expect(prep).toEqual({ id: 'prep', active: false, completed: true });
  });

  it('marks a zone with no agents as neither active nor completed', () => {
    const states = deriveZoneStates([], ZONE_DEFINITIONS);
    for (const zone of states) {
      expect(zone.active).toBe(false);
      expect(zone.completed).toBe(false);
    }
  });

  it('a zone is not completed if some agents are still working', () => {
    const agents: OfficeAgentState[] = [
      officeAgent({ id: 'a1', zoneId: 'workshop', status: 'done' }),
      officeAgent({ id: 'a2', zoneId: 'workshop', status: 'working' }),
    ];
    const states = deriveZoneStates(agents, ZONE_DEFINITIONS);
    const workshop = states.find((z) => z.id === 'workshop');
    expect(workshop).toEqual({ id: 'workshop', active: true, completed: false });
  });
});

describe(computeReviewerIndices, () => {
  it('assigns stable indices sorted by agent ID', () => {
    const agents: LogicalAgentState[] = [
      agent({ id: 'c-reviewer', phase: 'review', roleType: 'reviewer' }),
      agent({ id: 'a-reviewer', phase: 'review', roleType: 'reviewer' }),
      agent({ id: 'b-reviewer', phase: 'review', roleType: 'reviewer' }),
    ];
    const indices = computeReviewerIndices(agents);

    expect(indices.get('a-reviewer')).toBe(1);
    expect(indices.get('b-reviewer')).toBe(2);
    expect(indices.get('c-reviewer')).toBe(3);
  });

  it('includes simplifier and holistic agents', () => {
    const agents: LogicalAgentState[] = [
      agent({ id: 'rev1', phase: 'review', roleType: 'reviewer' }),
      agent({ id: 'simp', phase: 'simplifier', roleType: 'reviewer' }),
      agent({ id: 'hol', phase: 'holistic', roleType: 'reviewer' }),
    ];
    const indices = computeReviewerIndices(agents);
    expect(indices.size).toBe(3);
  });

  it('caps at slot index 5', () => {
    const agents: LogicalAgentState[] = Array.from({ length: 8 }, (_, i) =>
      agent({ id: `rev-${String(i).padStart(2, '0')}`, phase: 'review', roleType: 'reviewer' }),
    );
    const indices = computeReviewerIndices(agents);

    const maxIndex = Math.max(...indices.values());
    expect(maxIndex).toBe(5);
  });
});

describe(buildArtifactStates, () => {
  it('increments storage counter only for delivered artifacts', () => {
    const artifacts: LogicalArtifactState[] = [
      artifact({ id: 'a1', status: 'delivered', producerPhase: 'architecture' }),
      artifact({ id: 'a2', status: 'created', producerPhase: 'planning' }),
      artifact({ id: 'a3', status: 'delivered', producerPhase: 'implementation' }),
    ];
    const result = buildArtifactStates(artifacts);

    expect(result[0]?.slotId).toBe('governor-storage-0');
    expect(result[1]?.slotId).toBe('prep-ws-1');
    expect(result[2]?.slotId).toBe('governor-storage-1');
  });
});

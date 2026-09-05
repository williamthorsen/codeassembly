import { describe, expect, it } from 'vitest';

import { createOfficeLayout } from '../layout/office-layout.ts';
import { resolvePositions } from '../layout/position-resolver.ts';
import type { OfficeSceneConfig } from '../types.ts';

describe(resolvePositions, () => {
  const layout = createOfficeLayout();

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

  it('resolves orchestrator position to its slot position', () => {
    const c = config();
    const positions = resolvePositions(c, layout);

    const expected = layout.slotPosition('governor-desk-0');
    expect(positions.orchestrator).toEqual(expected);
  });

  it('resolves orchestrator at prep standing slot', () => {
    const c = config({
      orchestrator: {
        status: 'dispatching',
        carriedArtifacts: [],
        codeBadge: null,
        waiting: false,
        zoneId: 'prep',
        slotId: 'prep-standing-0',
      },
    });
    const positions = resolvePositions(c, layout);

    const expected = layout.slotPosition('prep-standing-0');
    expect(positions.orchestrator).toEqual(expected);
  });

  it('resolves agent positions to slot positions', () => {
    const c = config({
      agents: [
        {
          id: 'a1',
          role: 'architect',
          roleType: 'analyst',
          phase: 'architecture',
          status: 'working',
          zoneId: 'prep',
          slotId: 'prep-desk-0',
        },
      ],
    });
    const positions = resolvePositions(c, layout);

    const expected = layout.slotPosition('prep-desk-0');
    expect(positions.agents.get('a1')).toEqual(expected);
  });

  it('resolves artifact positions to slot positions', () => {
    const c = config({
      artifacts: [
        {
          id: 'art1',
          label: 'plan',
          color: '#00ff00',
          status: 'delivered',
          producerPhase: 'planning',
          zoneId: 'governor',
          slotId: 'governor-storage-0',
        },
      ],
    });
    const positions = resolvePositions(c, layout);

    const expected = layout.slotPosition('governor-storage-0');
    expect(positions.artifacts.get('art1')).toEqual(expected);
  });

  it('resolves multiple agents and artifacts', () => {
    const c = config({
      agents: [
        {
          id: 'a1',
          role: 'architect',
          roleType: 'analyst',
          phase: 'architecture',
          status: 'working',
          zoneId: 'prep',
          slotId: 'prep-desk-0',
        },
        {
          id: 'a2',
          role: 'coder',
          roleType: 'author',
          phase: 'implementation',
          status: 'idle',
          zoneId: 'workshop',
          slotId: 'workshop-desk-0',
        },
      ],
      artifacts: [
        {
          id: 'art1',
          label: 'doc',
          color: '#0000ff',
          status: 'created',
          producerPhase: 'architecture',
          zoneId: 'prep',
          slotId: 'prep-desk-0',
        },
      ],
    });
    const positions = resolvePositions(c, layout);

    expect(positions.agents.size).toBe(2);
    expect(positions.artifacts.size).toBe(1);
    expect(positions.agents.get('a1')).toEqual(layout.slotPosition('prep-desk-0'));
    expect(positions.agents.get('a2')).toEqual(layout.slotPosition('workshop-desk-0'));
  });

  it('returns empty maps for empty config', () => {
    const c = config();
    const positions = resolvePositions(c, layout);

    expect(positions.agents.size).toBe(0);
    expect(positions.artifacts.size).toBe(0);
  });
});

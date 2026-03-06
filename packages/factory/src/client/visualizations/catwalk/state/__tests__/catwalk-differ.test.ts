import { describe, expect, it } from 'vitest';

import type { OrchestratorConfig } from '../../types.js';
import { diffOrchestrator } from '../catwalk-differ.js';

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

import type { OrchestratorConfig, OrchestratorDiff } from '../types.js';

/** Compare two orchestrator configs and return position/working changes. */
export function diffOrchestrator(prev: OrchestratorConfig, next: OrchestratorConfig): OrchestratorDiff {
  const moved = prev.stationIndex !== next.stationIndex ? { from: prev.stationIndex, to: next.stationIndex } : null;

  const workingChanged = prev.working !== next.working ? { from: prev.working, to: next.working } : null;

  return { moved, workingChanged };
}

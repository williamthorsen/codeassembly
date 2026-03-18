import { describe, expect, it } from 'vitest';

import type { RunEvent, RunHeader } from '../../../shared/types/run-log.js';
import { generateSnapshots } from '../generate-snapshots.js';

const header: RunHeader = {
  runId: 'test-run',
  projectSlug: 'test',
  ticketId: undefined,
  projectRoot: '/test',
  branch: 'main',
  task: 'test task',
  startedAt: '2026-01-01T00:00:00Z',
  externalPlan: undefined,
  mergeBaseSha: undefined,
  diffBase: undefined,
  maxReviewRounds: undefined,
  effort: undefined,
  approvalThreshold: undefined,
  budgetThreshold: undefined,
  mode: 'orchestrated',
  model: 'claude-opus-4-6',
};

const events: RunEvent[] = [
  { t: '2026-01-01T00:00:00Z', event: 'run_started' },
  { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
  {
    t: '2026-01-01T00:02:00Z',
    event: 'phase_completed',
    phase: 'architecture',
    status: 'completed',
    data: { impactLevel: 'high' },
  },
  { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
];

describe(generateSnapshots, () => {
  it('generates one snapshot per event when indices are omitted', () => {
    const snapshots = generateSnapshots(header, events);

    expect(snapshots).toHaveLength(4);
  });

  it('generates snapshots only for specified indices', () => {
    const snapshots = generateSnapshots(header, events, [0, 3]);

    expect(snapshots).toHaveLength(2);
  });

  it('produces correct state at each all-events position', () => {
    const snapshots = generateSnapshots(header, events);

    // After run_started (index 0) — in_progress, no phases started
    expect(snapshots[0]?.status).toBe('in_progress');
    expect(snapshots[0]?.phases.architecture).toBeUndefined();

    // After phase_started (index 1) — architecture in_progress
    expect(snapshots[1]?.phases.architecture?.status).toBe('in_progress');

    // After phase_completed (index 2) — architecture completed
    expect(snapshots[2]?.phases.architecture?.status).toBe('completed');

    // After run_completed (index 3) — run completed
    expect(snapshots[3]?.status).toBe('completed');
  });

  it('produces correct state at curated indices', () => {
    const snapshots = generateSnapshots(header, events, [1, 3]);

    // Index 1: after run_started + phase_started
    expect(snapshots[0]?.phases.architecture?.status).toBe('in_progress');

    // Index 3: after all events — run completed
    expect(snapshots[1]?.status).toBe('completed');
  });

  it('returns an empty array for empty events', () => {
    const snapshots = generateSnapshots(header, []);

    expect(snapshots).toHaveLength(0);
  });
});

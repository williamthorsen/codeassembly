import { describe, expect, it } from 'vitest';

import { DEMO_RECORDINGS } from '../index.js';
import { moderatelyComplexRun } from '../recordings/moderately-complex-run.js';

describe('DEMO_RECORDINGS', () => {
  it('has at least one recording', () => {
    expect(DEMO_RECORDINGS.length).toBeGreaterThanOrEqual(1);
  });

  it.each(DEMO_RECORDINGS)('$name: last snapshot has a terminal status with a defined completedAt', (recording) => {
    const lastSnapshot = recording.snapshots.at(-1);
    expect(lastSnapshot).toBeDefined();
    expect(['completed', 'failed', 'needs_manual_review']).toContain(lastSnapshot?.status);
    expect(lastSnapshot?.completedAt).toBeDefined();
  });

  it('Moderately complex run: exercises all 6 phase stations', () => {
    const lastSnapshot = moderatelyComplexRun.snapshots.at(-1);
    expect(lastSnapshot).toBeDefined();

    expect(lastSnapshot?.phases.architecture).toBeDefined();
    expect(lastSnapshot?.phases.planning).toBeDefined();
    expect(lastSnapshot?.phases.implementation).toBeDefined();
    expect(lastSnapshot?.phases.parallelReview).toBeDefined();
    expect(lastSnapshot?.phases.codeSimplifier).toBeDefined();
    expect(lastSnapshot?.phases.holisticReview).toBeDefined();

    expect(lastSnapshot?.status).toBe('completed');
  });

  it('Moderately complex run: has at least 3 reviewers', () => {
    const lastSnapshot = moderatelyComplexRun.snapshots.at(-1);
    expect(lastSnapshot).toBeDefined();

    const reviewerCount = Object.keys(lastSnapshot?.phases.parallelReview?.reviewers ?? {}).length;
    expect(reviewerCount).toBeGreaterThanOrEqual(3);
  });

  it('Moderately complex run: has ~27 curated snapshots', () => {
    expect(moderatelyComplexRun.snapshots.length).toBeGreaterThanOrEqual(20);
    expect(moderatelyComplexRun.snapshots.length).toBeLessThanOrEqual(30);
  });

  it('Moderately complex run: first snapshot is in_progress with no artifacts', () => {
    const first = moderatelyComplexRun.snapshots[0];
    expect(first).toBeDefined();
    expect(first?.status).toBe('in_progress');
    expect(first?.artifacts).toHaveLength(0);
  });

  it('Moderately complex run: last snapshot has all 10 artifacts', () => {
    const last = moderatelyComplexRun.snapshots.at(-1);
    expect(last).toBeDefined();
    expect(last?.artifacts?.length).toBe(10);
  });
});

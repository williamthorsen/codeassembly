import { describe, expect, it } from 'vitest';

import { foldEvents } from '../../../shared/event-folder.js';
import { DEMO_RECORDINGS } from '../index.js';
import { moderatelyComplexRun } from '../recordings/moderately-complex-run.js';

describe('DEMO_RECORDINGS', () => {
  it('has at least one recording', () => {
    expect(DEMO_RECORDINGS.length).toBeGreaterThanOrEqual(1);
  });

  it.each(DEMO_RECORDINGS)('$name: folds into a terminal status with a defined completedAt', (recording) => {
    const result = foldEvents(recording.header, recording.events);

    expect(['completed', 'failed', 'needs_manual_review']).toContain(result.status);
    expect(result.completedAt).toBeDefined();
  });

  it('Moderately complex run: exercises all 7 phase stations', () => {
    const result = foldEvents(moderatelyComplexRun.header, moderatelyComplexRun.events);

    expect(result.phases.architecture).toBeDefined();
    expect(result.phases.planning).toBeDefined();
    expect(result.phases.implementation).toBeDefined();
    expect(result.phases.parallelReview).toBeDefined();
    expect(result.phases.codeSimplifier).toBeDefined();
    expect(result.phases.holisticReview).toBeDefined();

    // The 7th phase (summary) is implicit via run_completed
    expect(result.status).toBe('completed');
  });

  it('Moderately complex run: has at least 3 reviewers', () => {
    const result = foldEvents(moderatelyComplexRun.header, moderatelyComplexRun.events);

    const reviewerCount = Object.keys(result.phases.parallelReview?.reviewers ?? {}).length;
    expect(reviewerCount).toBeGreaterThanOrEqual(3);
  });
});

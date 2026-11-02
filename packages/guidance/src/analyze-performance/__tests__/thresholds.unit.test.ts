import { describe, expect, it } from 'vitest';

import { classifyMetric } from '../thresholds.ts';

describe('classifyMetric', () => {
  it.each([
    ['lcp', 2_500, 'good'],
    ['lcp', 2_501, 'needs-improvement'],
    ['lcp', 4_001, 'poor'],
    ['inp', 200, 'good'],
    ['inp', 500, 'needs-improvement'],
    ['inp', 501, 'poor'],
    ['cls', 0.1, 'good'],
    ['cls', 0.25, 'needs-improvement'],
    ['cls', 0.26, 'poor'],
    ['tbt', 600, 'needs-improvement'],
    ['tbt', 601, 'poor'],
    ['fcp', 1_800, 'good'],
  ] as const)('classes %s %d as %s', (metric, value, expected) => {
    expect(classifyMetric(metric, value)).toBe(expected);
  });

  it('returns null for Speed Index, which has no thresholds', () => {
    expect(classifyMetric('speedIndex', 9_000)).toBeNull();
  });
});

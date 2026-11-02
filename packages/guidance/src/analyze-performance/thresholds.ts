/** The metric thresholds against which the helper classes each value. */

/** The metrics that the helper reports, in lab and field data alike. */
export const METRICS = ['lcp', 'inp', 'cls', 'tbt', 'fcp', 'speedIndex'] as const;

/** A metric that the helper reports. */
export type Metric = (typeof METRICS)[number];

/** A value's standing against its metric's thresholds. */
export type MetricClass = 'good' | 'needs-improvement' | 'poor';

/**
 * The upper bound of `good` and of `needs-improvement` for each classed metric. LCP, INP, and CLS are the Core Web
 * Vitals thresholds at the 75th percentile; FCP takes web.dev's thresholds; TBT takes Lighthouse's mobile scoring bands
 * and stands in for INP in lab data. Speed Index is reported without a class.
 */
export const THRESHOLDS: Readonly<Partial<Record<Metric, readonly [good: number, needsImprovement: number]>>> = {
  cls: [0.1, 0.25],
  fcp: [1_800, 3_000],
  inp: [200, 500],
  lcp: [2_500, 4_000],
  tbt: [200, 600],
};

/** Classes a value against its metric's thresholds, or returns null for a metric without thresholds. */
export function classifyMetric(metric: Metric, value: number): MetricClass | null {
  const bounds = THRESHOLDS[metric];
  if (bounds === undefined) return null;
  if (value <= bounds[0]) return 'good';
  if (value <= bounds[1]) return 'needs-improvement';
  return 'poor';
}

/** Reads lab metrics, failing insights, and field data out of Lighthouse, PSI, and CrUX responses into one shape. */
import type { CruxFile, LighthouseReport, PsiLoadingExperience } from './schemas.ts';

/** The lab metrics of one run, in milliseconds except CLS; a metric that the report lacks is null. */
export type LabMetrics = Record<'cls' | 'fcp' | 'lcp' | 'speedIndex' | 'tbt', number | null>;

/** The 75th-percentile field metrics for a URL or an origin, in milliseconds except CLS. */
export type FieldMetrics = Record<'cls' | 'inp' | 'lcp', number | null>;

/** A failing Lighthouse insight in one run: its estimated savings per metric and its culprit resources. */
export interface RunInsight {
  id: string;
  title: string;
  savings: Record<string, number>;
  culprits: string[];
}

/** Strips a culprit resource's query string and fragment, so that one resource matches across pages. */
export function normalizeCulprit(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.replace(/[?#].*$/, '');
  }
}

/** Reads the field metrics of a CrUX file's URL record and origin record. */
export function readCruxField(file: CruxFile): { origin: FieldMetrics | null; url: FieldMetrics | null } {
  return {
    origin: file.origin === null ? null : readCruxMetrics(file.origin.record.metrics),
    url: file.url === null ? null : readCruxMetrics(file.url.record.metrics),
  };
}

/**
 * Lists the insights that a report fails: every `*-insight` audit that is scored below 0.9 or estimates a saving,
 * excluding those that Lighthouse marks not applicable, manual, or errored.
 */
export function readFailingInsights(report: LighthouseReport): RunInsight[] {
  const insights: RunInsight[] = [];
  for (const audit of Object.values(report.audits)) {
    if (!audit.id.endsWith('-insight')) continue;
    if (EXCLUDED_DISPLAY_MODES.has(audit.scoreDisplayMode ?? '')) continue;
    const savings = Object.fromEntries(
      Object.entries(audit.metricSavings ?? {}).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0,
      ),
    );
    const scored = typeof audit.score === 'number' && audit.score < 0.9;
    if (!scored && Object.keys(savings).length === 0) continue;
    const culprits = [...new Set(collectUrls(audit.details, 0).map(normalizeCulprit))].toSorted();
    insights.push({ id: audit.id, title: audit.title ?? audit.id, savings, culprits });
  }
  return insights.toSorted((a, b) => a.id.localeCompare(b.id));
}

/** Reads the lab metrics of one Lighthouse report. */
export function readLabMetrics(report: LighthouseReport): LabMetrics {
  return {
    cls: readNumericValue(report, 'cumulative-layout-shift'),
    fcp: readNumericValue(report, 'first-contentful-paint'),
    lcp: readNumericValue(report, 'largest-contentful-paint'),
    speedIndex: readNumericValue(report, 'speed-index'),
    tbt: readNumericValue(report, 'total-blocking-time'),
  };
}

/**
 * Reads a PSI field-data block. PSI reports CLS multiplied by 100, and sets `origin_fallback` when it substitutes the
 * origin's data for a URL that lacks its own; such a block is not URL data.
 */
export function readPsiField(block: PsiLoadingExperience | undefined, scope: 'origin' | 'url'): FieldMetrics | null {
  if (block?.metrics === undefined) return null;
  if (scope === 'url' && block.origin_fallback === true) return null;
  const metrics = block.metrics;
  const cls = metrics['CUMULATIVE_LAYOUT_SHIFT_SCORE']?.percentile;
  const fieldMetrics: FieldMetrics = {
    cls: cls === undefined ? null : cls / 100,
    inp: metrics['INTERACTION_TO_NEXT_PAINT']?.percentile ?? null,
    lcp: metrics['LARGEST_CONTENTFUL_PAINT_MS']?.percentile ?? null,
  };
  return Object.values(fieldMetrics).every((value) => value === null) ? null : fieldMetrics;
}

const EXCLUDED_DISPLAY_MODES: ReadonlySet<string> = new Set(['error', 'manual', 'notApplicable']);

/** Bounds the walk through nested details: A list of tables whose rows have sub-items nests about six levels deep. */
const MAX_DETAILS_DEPTH = 8;

/** The details keys under which Lighthouse nests rows that can name a culprit resource. */
const NESTING_KEYS: ReadonlySet<string> = new Set(['items', 'list', 'subItems', 'value']);

// region | Helpers

/** Collects every string `url` field in an audit's details, walking nested tables and lists. */
function collectUrls(value: unknown, depth: number): string[] {
  if (depth > MAX_DETAILS_DEPTH || typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectUrls(item, depth + 1));
  const urls: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'url' && typeof child === 'string' && /^https?:/.test(child)) urls.push(child);
    else if (NESTING_KEYS.has(key)) urls.push(...collectUrls(child, depth + 1));
  }
  return urls;
}

/** Reads a CrUX API record's metrics; the API reports CLS's 75th percentile as a string. */
function readCruxMetrics(metrics: Record<string, { percentiles: { p75: number | string } }>): FieldMetrics {
  return {
    cls: readP75(metrics['cumulative_layout_shift']),
    inp: readP75(metrics['interaction_to_next_paint']),
    lcp: readP75(metrics['largest_contentful_paint']),
  };
}

/** Reads an audit's numeric value, or null when the report lacks the audit or its value. */
function readNumericValue(report: LighthouseReport, id: string): number | null {
  return report.audits[id]?.numericValue ?? null;
}

/** Reads a CrUX metric's 75th percentile as a number, or null when it is absent or not numeric. */
function readP75(metric: { percentiles: { p75: number | string } } | undefined): number | null {
  if (metric === undefined) return null;
  const value = Number(metric.percentiles.p75);
  return Number.isFinite(value) ? value : null;
}

// endregion | Helpers

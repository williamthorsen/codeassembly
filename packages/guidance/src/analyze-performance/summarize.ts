/** Reduces a run directory to medians, threshold classes, field data, and the failing insights merged across pages. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  type FieldMetrics,
  type LabMetrics,
  readCruxField,
  readFailingInsights,
  readLabMetrics,
  readPsiField,
} from './normalize.ts';
import {
  CruxFileSchema,
  type FORM_FACTORS,
  type LighthouseReport,
  LighthouseReportSchema,
  type Manifest,
  type ManifestPage,
  PsiResponseSchema,
} from './schemas.ts';
import { classifyMetric, type MetricClass } from './thresholds.ts';

/** The fewest successful runs from which a page's lab row is ranked. */
export const MIN_RANKED_RUNS = 2;

/** A metric's value with its class; `proxyFor` marks lab TBT, which stands in for INP. */
export interface ClassedValue {
  value: number;
  class: MetricClass | null;
  proxyFor?: 'inp';
}

/** A lab metric: the median across successful runs, each run's value, and the median's class. */
export interface LabValue extends ClassedValue {
  values: number[];
}

/** One page's lab results in one form factor. */
export interface LabRow {
  runsSucceeded: number;
  insufficientRuns: boolean;
  errors: string[];
  metrics: Partial<Record<keyof LabMetrics, LabValue>>;
}

/** One page's field data in one form factor, at URL and origin level. */
export interface FieldRow {
  url: Partial<Record<keyof FieldMetrics, ClassedValue>> | null;
  origin: Partial<Record<keyof FieldMetrics, ClassedValue>> | null;
}

/** One page's summary. */
export interface PageSummary {
  url: string;
  slug: string;
  tool: ManifestPage['tool'];
  fallbackReason: string | null;
  field: {
    source: ManifestPage['fieldSource'];
    unavailableReason: string | null;
    byFormFactor: Record<FormFactor, FieldRow>;
  };
  lab: Record<FormFactor, LabRow>;
}

/** A failing insight merged across the pages and form factors that report it for one culprit resource. */
export interface MergedInsight {
  id: string;
  title: string;
  culprit: string | null;
  occurrences: Array<{ slug: string; formFactor: FormFactor }>;
  /** The largest saving per metric across occurrences, each the median across the occurrence's runs. */
  savings: Record<string, number>;
  files: string[];
}

/** The summary of a run directory. */
export interface Summary {
  createdAt: string;
  lighthouseVersion: string;
  pages: PageSummary[];
  insights: MergedInsight[];
  unmeasured: string[];
}

/** Summarizes the run directory that `collect` wrote, reading each raw file that its manifest names. */
export function summarize(manifest: Manifest, directory: string): Summary {
  const pages: PageSummary[] = [];
  const insights = new Map<string, MergedInsight>();
  const unmeasured: string[] = [];

  for (const page of manifest.pages) {
    const lab = {
      mobile: summarizeLab(page, 'mobile', directory, insights, unmeasured),
      desktop: summarizeLab(page, 'desktop', directory, insights, unmeasured),
    };
    const field = { mobile: readField(page, 'mobile', directory), desktop: readField(page, 'desktop', directory) };
    if (page.fieldUnavailableReason !== null) {
      const state = page.fieldSource === null ? 'unavailable' : 'from PSI only';
      unmeasured.push(`${page.url}: field data ${state}: ${page.fieldUnavailableReason}`);
    }
    pages.push({
      url: page.url,
      slug: page.slug,
      tool: page.tool,
      fallbackReason: page.fallbackReason,
      field: { source: page.fieldSource, unavailableReason: page.fieldUnavailableReason, byFormFactor: field },
      lab,
    });
  }

  return {
    createdAt: manifest.createdAt,
    lighthouseVersion: manifest.lighthouseVersion,
    pages,
    insights: insights.values().toArray().toSorted(compareInsights),
    unmeasured,
  };
}

// region | Helpers

type FormFactor = (typeof FORM_FACTORS)[number];

const LAB_METRICS: ReadonlyArray<keyof LabMetrics> = ['lcp', 'cls', 'tbt', 'fcp', 'speedIndex'];

const FIELD_METRICS: ReadonlyArray<keyof FieldMetrics> = ['lcp', 'inp', 'cls'];

/** Builds a lab row from a form factor's successful reports. */
function buildLabRow(reports: readonly LighthouseReport[], errors: string[]): LabRow {
  const metrics: LabRow['metrics'] = {};
  const perRun = reports.map(readLabMetrics);
  for (const metric of LAB_METRICS) {
    const values = perRun.map((run) => run[metric]).filter((value) => value !== null);
    if (values.length === 0) continue;
    const value = median(values);
    metrics[metric] = {
      value,
      values,
      class: classifyMetric(metric, value),
      ...(metric === 'tbt' && { proxyFor: 'inp' }),
    };
  }
  return { runsSucceeded: reports.length, insufficientRuns: reports.length < MIN_RANKED_RUNS, errors, metrics };
}

/** Classes each field metric that is present. */
function classifyField(metrics: FieldMetrics | null): FieldRow['url'] {
  if (metrics === null) return null;
  const classed: NonNullable<FieldRow['url']> = {};
  for (const metric of FIELD_METRICS) {
    const value = metrics[metric];
    if (value !== null) classed[metric] = { value, class: classifyMetric(metric, value) };
  }
  return classed;
}

/** Orders merged insights by their largest millisecond saving, then by id and culprit. */
function compareInsights(a: MergedInsight, b: MergedInsight): number {
  return (
    largestMillisecondSaving(b) - largestMillisecondSaving(a) ||
    a.id.localeCompare(b.id) ||
    (a.culprit ?? '').localeCompare(b.culprit ?? '')
  );
}

/** Returns an insight's largest saving in milliseconds, across every metric but CLS. */
function largestMillisecondSaving(insight: MergedInsight): number {
  const milliseconds = Object.entries(insight.savings)
    .filter(([metric]) => metric !== 'CLS')
    .map(([, value]) => value);
  return Math.max(0, ...milliseconds);
}

/** Returns the median of a non-empty list, averaging the middle pair of an even-length list. */
function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Adds one page and form factor's failing insights to the merged set, keyed by insight id and culprit resource. */
function mergeInsights(
  merged: Map<string, MergedInsight>,
  slug: string,
  formFactor: FormFactor,
  reports: ReadonlyArray<{ file: string; report: LighthouseReport }>,
): void {
  const byKey = new Map<
    string,
    { id: string; title: string; culprit: string | null; savings: Array<Record<string, number>>; files: string[] }
  >();
  for (const { file, report } of reports) {
    for (const insight of readFailingInsights(report)) {
      const culprits = insight.culprits.length === 0 ? [null] : insight.culprits;
      for (const culprit of culprits) {
        const key = `${insight.id}\0${culprit ?? ''}`;
        const entry = byKey.get(key) ?? { id: insight.id, title: insight.title, culprit, savings: [], files: [] };
        entry.savings.push(insight.savings);
        entry.files.push(file);
        byKey.set(key, entry);
      }
    }
  }
  for (const [key, entry] of byKey) {
    const target = merged.get(key) ?? {
      id: entry.id,
      title: entry.title,
      culprit: entry.culprit,
      occurrences: [],
      savings: {},
      files: [],
    };
    target.occurrences.push({ slug, formFactor });
    target.files.push(...entry.files);
    const metrics = new Set(entry.savings.flatMap((savings) => Object.keys(savings)));
    for (const metric of metrics) {
      // Count each run that does not report the insight as a zero saving.
      const unreported = Array.from({ length: reports.length - entry.savings.length }, () => 0);
      const value = median([...entry.savings.map((savings) => savings[metric] ?? 0), ...unreported]);
      target.savings[metric] = Math.max(target.savings[metric] ?? 0, value);
    }
    merged.set(key, target);
  }
}

/** Reads a page's field data in one form factor from its CrUX file or the PSI response that the manifest names. */
function readField(page: ManifestPage, formFactor: FormFactor, directory: string): FieldRow {
  if (page.fieldSource === 'crux-api') {
    const file = page.crux[formFactor];
    if (file === null) return { url: null, origin: null };
    const crux = readCruxField(CruxFileSchema.parse(readJson(directory, file)));
    return { url: classifyField(crux.url), origin: classifyField(crux.origin) };
  }
  if (page.fieldSource === 'psi') {
    const file = page.psiField[formFactor];
    if (file === null) return { url: null, origin: null };
    const response = PsiResponseSchema.parse(readJson(directory, file));
    return {
      url: classifyField(readPsiField(response.loadingExperience, 'url')),
      origin: classifyField(readPsiField(response.originLoadingExperience, 'origin')),
    };
  }
  return { url: null, origin: null };
}

/**
 * Builds one page's lab row in one form factor, merging its insights when the row has enough runs to rank on, and
 * recording it as unmeasured otherwise.
 */
function summarizeLab(
  page: ManifestPage,
  formFactor: FormFactor,
  directory: string,
  insights: Map<string, MergedInsight>,
  unmeasured: string[],
): LabRow {
  const runs = page.runs.filter((run) => run.formFactor === formFactor);
  const errors: string[] = [];
  const reports: Array<{ file: string; report: LighthouseReport }> = [];
  for (const run of runs) {
    if (run.error !== null) errors.push(run.error);
    else if (run.file !== null) reports.push({ file: run.file, report: readReport(directory, run.file, page.tool) });
  }
  const row = buildLabRow(
    reports.map(({ report }) => report),
    errors,
  );
  if (row.insufficientRuns) {
    unmeasured.push(
      `${page.url} (${formFactor}): ${row.runsSucceeded} of ${runs.length} lab runs succeeded, too few to rank on`,
    );
  } else {
    mergeInsights(insights, page.slug, formFactor, reports);
  }
  return row;
}

/** Reads and parses a JSON file under the run directory. */
function readJson(directory: string, file: string): unknown {
  return JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
}

/** Reads a run's Lighthouse report: the file itself from the CLI, or the `lighthouseResult` of a PSI response. */
function readReport(directory: string, file: string, tool: ManifestPage['tool']): LighthouseReport {
  const json = readJson(directory, file);
  const report = tool === 'psi' ? PsiResponseSchema.parse(json).lighthouseResult : json;
  return LighthouseReportSchema.parse(report);
}

// endregion | Helpers

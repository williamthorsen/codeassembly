/** Builders over the tool-response fixtures, each returning a fresh copy that a test may change. */
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('../__tests__/fixtures/', import.meta.url);

/** The lab values that a built report sets, in milliseconds except CLS. */
export interface ReportValues {
  cls?: number;
  fcp?: number;
  lcp?: number;
  tbt?: number;
}

/** Builds a CrUX API record from the fixture. */
export function buildCruxRecord(): unknown {
  return readFixture('crux-record.json');
}

/** Builds a PSI response around a Lighthouse report, with or without the fixture's field data. */
export function buildPsiResponse(report: unknown, { field }: { field: boolean }): Record<string, unknown> {
  const response = readFixture('psi-field.json');
  if (!isRecord(response)) throw new Error('psi-field.json is not an object');
  return field ? { ...response, lighthouseResult: report } : { lighthouseResult: report };
}

/** Builds a Lighthouse 13 report from the fixture, setting the given lab values and an optional runtime error. */
export function buildReport(values: ReportValues = {}, runtimeError?: { code: string }): Record<string, unknown> {
  const report = readFixture('lighthouse-report.json');
  if (!isRecord(report) || !isRecord(report['audits'])) throw new Error('lighthouse-report.json lacks audits');
  const audits = report['audits'];
  for (const key of REPORT_KEYS) {
    const value = values[key];
    const audit = audits[AUDIT_IDS[key]];
    if (value !== undefined && isRecord(audit)) audit['numericValue'] = value;
  }
  return runtimeError === undefined ? report : { ...report, runtimeError };
}

const REPORT_KEYS = ['cls', 'fcp', 'lcp', 'tbt'] as const;

const AUDIT_IDS: Readonly<Record<keyof ReportValues, string>> = {
  cls: 'cumulative-layout-shift',
  fcp: 'first-contentful-paint',
  lcp: 'largest-contentful-paint',
  tbt: 'total-blocking-time',
};

// region | Helpers

/** Narrows a parsed JSON value to an object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads and parses a fixture file. */
function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

// endregion | Helpers

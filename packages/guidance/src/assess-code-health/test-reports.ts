/** Parsers for the two test-report formats that `sense` reads: an istanbul `json-summary` and JUnit XML. */
import path from 'node:path';

import { z } from 'zod';

/** A file's coverage percentages. */
export interface CoverageRow {
  path: string;
  lines: number;
  branches: number;
  functions: number;
}

/** One test case's duration. */
export interface TimingRow {
  file: string;
  name: string;
  durationMs: number;
}

/** The number of slowest test cases that `parseJunit` keeps. */
export const MAX_TIMING_ROWS = 100;

/**
 * Reads an istanbul `json-summary` document and returns the rows of the files inside `unit`, with paths relative to
 * `root`. Throws when the document does not have the summary shape.
 */
export function parseCoverageSummary(json: unknown, root: string, unit: string): CoverageRow[] {
  const summary = CoverageSummarySchema.parse(json);
  const rows: CoverageRow[] = [];
  for (const [file, metrics] of Object.entries(summary)) {
    if (file === 'total') continue;
    const relative = path.isAbsolute(file) ? path.relative(root, file) : file;
    if (!isInsideUnit(relative, unit)) continue;
    rows.push({
      path: relative,
      lines: metrics.lines.pct,
      branches: metrics.branches.pct,
      functions: metrics.functions.pct,
    });
  }
  rows.sort((left, right) => left.lines - right.lines || left.path.localeCompare(right.path));
  return rows;
}

/**
 * Reads JUnit XML and returns the `MAX_TIMING_ROWS` slowest test cases. A case's file is its `file` attribute, else its
 * enclosing suite's name, else its `classname`.
 */
export function parseJunit(xml: string): TimingRow[] {
  const rows: TimingRow[] = [];
  let suite = '';
  for (const match of xml.matchAll(/<(testsuite|testcase)\b([^>]*)>/g)) {
    const [, tag, attributeText = ''] = match;
    const attributes = readAttributes(attributeText);
    if (tag === 'testsuite') {
      suite = attributes.get('name') ?? '';
      continue;
    }
    const seconds = Number(attributes.get('time') ?? 'NaN');
    if (!Number.isFinite(seconds)) continue;
    rows.push({
      file: attributes.get('file') ?? (suite || (attributes.get('classname') ?? '')),
      name: attributes.get('name') ?? '',
      durationMs: Math.round(seconds * 1_000),
    });
  }
  rows.sort((left, right) => right.durationMs - left.durationMs || left.name.localeCompare(right.name));
  return rows.slice(0, MAX_TIMING_ROWS);
}

// region | Helpers

const MetricSchema = z.object({ pct: z.number() });

const CoverageSummarySchema = z.record(
  z.string(),
  z.object({ lines: MetricSchema, branches: MetricSchema, functions: MetricSchema }),
);

const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

/** Reports whether a repository-relative path is the unit or lies beneath it. */
function isInsideUnit(relative: string, unit: string): boolean {
  const normalized = unit.replace(/\/+$/, '');
  return normalized === '.' || relative === normalized || relative.startsWith(`${normalized}/`);
}

/** Reads the double-quoted attributes of a tag, decoding the predefined XML entities. */
function readAttributes(text: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name = '', value = ''] of text.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attributes.set(
      name,
      value.replaceAll(/&(amp|apos|gt|lt|quot);/g, (entity, key: string) => XML_ENTITIES[key] ?? entity),
    );
  }
  return attributes;
}

// endregion | Helpers

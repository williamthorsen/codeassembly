import { type Document, isScalar, isSeq } from 'yaml';

import { findPair, valueLine } from '../frontmatter/yaml-position.ts';
import { resolveRequiredForRecordType } from '../schema/load-schema.ts';
import type { Finding, FrontmatterRaw, ParsedNote, Schema } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';

const DATE_FIELDS = ['created', 'updated', 'last-verified'] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
// The list-shape fields. Each must be a YAML sequence; entries are left free-form (like `sources`). `tags` keeps its
// own `frontmatter.tags` rule id; the multi-valued `addressed-by`/`addresses` relation fields share `frontmatter.list`.
const LIST_SHAPE_FIELDS = [
  { field: 'tags', rule: 'frontmatter.tags' },
  { field: 'addressed-by', rule: 'frontmatter.list' },
  { field: 'addresses', rule: 'frontmatter.list' },
] as const;

/**
 * Validate a note's frontmatter block: presence, parseability, the stored `recordType` discriminant, the required
 * fields that record type declares, date formats, tags shape, and relation-list shape.
 *
 * Findings are produced in a fixed order. The block-level checks
 * (`frontmatter.missing`, `frontmatter.parse`, `frontmatter.empty`) early-exit
 * after their first finding; the field-level checks (`frontmatter.recordType`,
 * `.required`, `.date`, `.tags`, `.list`) accumulate.
 */
export const frontmatterRule: KbRule = {
  name: 'frontmatter',
  check(input: KbRuleInput): Finding[] {
    const { note, document, schema } = input;
    const findings: Finding[] = [];
    const raw = note.frontmatterRaw;

    if (raw === null || document === null) {
      findings.push({
        path: note.path,
        line: 1,
        rule: 'frontmatter.missing',
        severity: 'error',
        message: 'no frontmatter block found',
      });
      return findings;
    }

    if (raw.parseError !== undefined) {
      findings.push({
        path: note.path,
        line: raw.startLine,
        rule: 'frontmatter.parse',
        severity: 'error',
        message: `YAML parse error: ${raw.parseError}`,
      });
      return findings;
    }

    const doc = document.doc;
    if (doc.contents === null) {
      findings.push({
        path: note.path,
        line: raw.startLine,
        rule: 'frontmatter.empty',
        severity: 'error',
        message: 'frontmatter block is empty',
      });
      return findings;
    }

    const recordTypePair = findPair(doc, 'recordType');
    const recordType =
      recordTypePair !== null && isScalar(recordTypePair.value) ? recordTypePair.value.value : undefined;

    if (recordTypePair === null) {
      findings.push({
        path: note.path,
        line: raw.endLine,
        rule: 'frontmatter.recordType',
        severity: 'error',
        message: 'missing recordType',
      });
    } else if (typeof recordType !== 'string' || resolveRequiredForRecordType(schema, recordType) === undefined) {
      const shown = typeof recordType === 'string' ? `"${recordType}"` : String(recordType);
      findings.push({
        path: note.path,
        line: valueLine(recordTypePair, raw),
        rule: 'frontmatter.recordType',
        severity: 'error',
        message: `${shown} not in vocabulary [${Object.keys(schema.recordTypes).join(', ')}]`,
      });
    }

    for (const field of resolveRequired(schema, recordType)) {
      if (findPair(doc, field) === null) {
        findings.push({
          path: note.path,
          line: raw.endLine,
          rule: 'frontmatter.required',
          severity: 'error',
          message: `missing required field: ${field}`,
        });
      }
    }

    for (const field of DATE_FIELDS) {
      const pair = findPair(doc, field);
      if (pair === null || !isScalar(pair.value)) continue;
      const stringValue = toDateString(pair.value.value);
      const error = validateDate(stringValue);
      if (error !== null) {
        findings.push({
          path: note.path,
          line: valueLine(pair, raw),
          rule: 'frontmatter.date',
          severity: 'error',
          message: `${field}: ${error}`,
        });
      }
    }

    findings.push(...listShapeFindings(doc, raw, note));

    return findings;
  },
};

// region | Helpers

/**
 * Validates that each declared list-shape field is a YAML sequence, emitting one finding per field that is present but
 * scalar. Only the field's shape is checked; entries are left free-form.
 */
function listShapeFindings(doc: Document.Parsed, raw: FrontmatterRaw, note: ParsedNote): Finding[] {
  const findings: Finding[] = [];
  for (const { field, rule } of LIST_SHAPE_FIELDS) {
    const pair = findPair(doc, field);
    if (pair !== null && pair.value !== null && !isSeq(pair.value)) {
      findings.push({
        path: note.path,
        line: valueLine(pair, raw),
        rule,
        severity: 'error',
        message: `${field} must be a list`,
      });
    }
  }
  return findings;
}

/**
 * Resolves the required-field set a note is validated against: the record type's declared `required` fields. When the
 * `recordType` is absent or unknown to the schema (reported separately by the `recordType` check), no required fields
 * are enforced, so the fallback never silently widens validation.
 */
function resolveRequired(schema: Schema, recordType: unknown): readonly string[] {
  if (typeof recordType !== 'string') {
    return [];
  }
  return resolveRequiredForRecordType(schema, recordType) ?? [];
}

/** Coerces a scalar date value to a string. */
function toDateString(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

/**
 * Validate that a value is a real UTC instant in either the bare `YYYY-MM-DD` form or the second-precision
 * `YYYY-MM-DDTHH:MM:SSZ` form; returns an error message or `null`. An unmarked or offset timestamp (no trailing `Z`,
 * or `+00:00`) matches neither pattern and falls to the format error. Both forms are round-tripped through `Date.UTC`
 * so an unreal calendar date or unreal clock time is rejected.
 */
function validateDate(value: string): string | null {
  const isDateOnly = DATE_ONLY.test(value);
  if (!isDateOnly && !TIMESTAMP.test(value)) {
    return `expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ, got "${value}"`;
  }
  // Each regex guarantees fixed-width segments, so slice yields plain numeric strings.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = isDateOnly ? 0 : Number(value.slice(11, 13));
  const minute = isDateOnly ? 0 : Number(value.slice(14, 16));
  const second = isDateOnly ? 0 : Number(value.slice(17, 19));
  const roundTrip = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const isReal =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day &&
    roundTrip.getUTCHours() === hour &&
    roundTrip.getUTCMinutes() === minute &&
    roundTrip.getUTCSeconds() === second;
  if (!isReal) {
    return isDateOnly ? `"${value}" is not a real calendar date` : `"${value}" is not a real timestamp`;
  }
  return null;
}

// endregion | Helpers

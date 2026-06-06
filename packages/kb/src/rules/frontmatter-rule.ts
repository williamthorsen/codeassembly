import { isScalar, isSeq } from 'yaml';

import { findPair, valueLine } from '../frontmatter/yaml-position.ts';
import { resolveRequiredForRecordType } from '../schema/load-schema.ts';
import type { Finding, Schema } from '../types.ts';
import type { KbRule, KbRuleInput } from './types.ts';

const DATE_FIELDS = ['created', 'updated', 'last-verified'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a note's frontmatter block: presence, parseability, the stored `recordType` discriminant, the required
 * fields that record type declares, date formats, and tags shape.
 *
 * Findings are produced in a fixed order. The block-level checks
 * (`frontmatter.missing`, `frontmatter.parse`, `frontmatter.empty`) early-exit
 * after their first finding; the field-level checks (`frontmatter.required`,
 * `.recordType`, `.date`, `.tags`) accumulate.
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

    const tagsPair = findPair(doc, 'tags');
    if (tagsPair !== null && tagsPair.value !== null && !isSeq(tagsPair.value)) {
      findings.push({
        path: note.path,
        line: valueLine(tagsPair, raw),
        rule: 'frontmatter.tags',
        severity: 'error',
        message: 'tags must be a list',
      });
    }

    return findings;
  },
};

// region | Helpers

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

/** Validate that a value is a real UTC `YYYY-MM-DD` calendar date; returns an error message or `null`. */
function validateDate(value: string): string | null {
  if (!DATE_PATTERN.test(value)) {
    return `expected YYYY-MM-DD, got "${value}"`;
  }
  // The regex match guarantees fixed-width segments, so slice yields plain strings.
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day;
  if (!isRealDate) {
    return `"${value}" is not a real calendar date`;
  }
  return null;
}

/** Coerces a scalar date value to a string. */
function toDateString(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

// endregion | Helpers

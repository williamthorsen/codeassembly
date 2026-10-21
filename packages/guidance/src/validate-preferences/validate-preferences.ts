/**
 * Validates a parsed `preferences.yaml` against the preferences schema. The walker implements only the keywords that
 * the schema uses, so that it can report an unrecognized key as a warning while every other violation is an error.
 */
import { isRecord } from '../lib/type-guards.ts';
import { findNearestKey } from './find-nearest-key.ts';

/** One violation found in a preferences document. */
export interface Finding {
  readonly level: 'error' | 'warning';
  readonly path: string;
  readonly message: string;
}

/** Schema keywords that `walkValue` enforces. */
export const HANDLED_KEYWORDS: readonly string[] = [
  'additionalProperties',
  'enum',
  'items',
  'minimum',
  'minLength',
  'properties',
  'required',
  'type',
];

/** Schema keywords that describe a value without constraining it. */
export const ANNOTATION_KEYWORDS: readonly string[] = ['$id', '$schema', 'default', 'description', 'title'];

/** Returns every finding for `document` under `schema`, in document order. */
export function validatePreferences(document: unknown, schema: unknown): Finding[] {
  const findings: Finding[] = [];
  walkValue(document, schema, [], findings);
  return findings;
}

// region | Helpers

/** Renders a key path as dotted keys with bracketed array indices, or `(root)` for the document itself. */
function formatPath(segments: readonly (string | number)[]): string {
  if (segments.length === 0) {
    return '(root)';
  }
  return segments
    .map((segment, index) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }
      return index === 0 ? segment : `.${segment}`;
    })
    .join('');
}

/** Returns true when `value` satisfies the JSON Schema primitive `type`. */
function matchesType(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'object':
      return isRecord(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

/** Records one finding at `segments`. */
function report(
  findings: Finding[],
  level: Finding['level'],
  segments: readonly (string | number)[],
  message: string,
): void {
  findings.push({ level, path: formatPath(segments), message });
}

/** Checks the entries of an array against the schema's `items`. */
function walkArray(
  value: readonly unknown[],
  schema: Record<string, unknown>,
  segments: readonly (string | number)[],
  findings: Finding[],
): void {
  if (schema['items'] === undefined) {
    return;
  }
  for (const [index, item] of value.entries()) {
    walkValue(item, schema['items'], [...segments, index], findings);
  }
}

/**
 * Checks an object's required keys and each of its entries. A key that the schema's `properties` does not name is
 * checked against a schema-valued `additionalProperties`, accepted under `additionalProperties: true`, and otherwise
 * reported as unrecognized.
 */
function walkObject(
  value: Record<string, unknown>,
  schema: Record<string, unknown>,
  segments: readonly (string | number)[],
  findings: Finding[],
): void {
  const properties = isRecord(schema['properties']) ? schema['properties'] : undefined;
  if (Array.isArray(schema['required'])) {
    for (const key of schema['required']) {
      if (typeof key === 'string' && !Object.hasOwn(value, key)) {
        report(findings, 'error', segments, `missing required key '${key}'`);
      }
    }
  }
  for (const [key, entry] of Object.entries(value)) {
    const keySegments = [...segments, key];
    if (properties !== undefined && Object.hasOwn(properties, key)) {
      walkValue(entry, properties[key], keySegments, findings);
    } else if (isRecord(schema['additionalProperties'])) {
      walkValue(entry, schema['additionalProperties'], keySegments, findings);
    } else if (properties !== undefined && schema['additionalProperties'] !== true) {
      const nearest = findNearestKey(key, Object.keys(properties));
      const suggestion = nearest === undefined ? '' : `; did you mean '${nearest}'?`;
      report(findings, 'warning', keySegments, `unrecognized key${suggestion}`);
    }
  }
}

/** Checks `value` against one schema node, recursing into objects and arrays. */
function walkValue(value: unknown, schema: unknown, segments: readonly (string | number)[], findings: Finding[]): void {
  if (!isRecord(schema)) {
    return;
  }
  if (schema['type'] !== undefined && !matchesType(value, schema['type'])) {
    const expected = typeof schema['type'] === 'string' ? schema['type'] : JSON.stringify(schema['type']);
    report(findings, 'error', segments, `expected ${expected} (got ${JSON.stringify(value)})`);
    return;
  }
  if (Array.isArray(schema['enum']) && !schema['enum'].includes(value)) {
    const allowed = schema['enum'].map((candidate) => JSON.stringify(candidate)).join(', ');
    report(findings, 'error', segments, `must be one of ${allowed} (got ${JSON.stringify(value)})`);
  }
  if (typeof schema['minLength'] === 'number' && typeof value === 'string' && value.length < schema['minLength']) {
    report(findings, 'error', segments, `must be at least ${schema['minLength']} characters long`);
  }
  if (typeof schema['minimum'] === 'number' && typeof value === 'number' && value < schema['minimum']) {
    report(findings, 'error', segments, `must be at least ${schema['minimum']} (got ${value})`);
  }
  if (isRecord(value)) {
    walkObject(value, schema, segments, findings);
  } else if (Array.isArray(value)) {
    walkArray(value, schema, segments, findings);
  }
}

// endregion | Helpers

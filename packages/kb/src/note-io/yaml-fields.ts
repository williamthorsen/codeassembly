import { Document, parseDocument, stringify } from 'yaml';

import { isRecord } from '../type-guards.ts';

// Type-blind parse/render of a note's frontmatter as an ordered field map. This module is the canonical home for the
// YAML quoting decisions: it quotes exactly the strings that would otherwise re-parse as a non-string and keeps
// round-trip-safe strings plain, so any record type rendered through it round-trips faithfully.
const SCALAR_STRINGIFY_OPTIONS = {
  schema: 'core',
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  singleQuote: true,
  lineWidth: 0,
} as const;

/**
 * Parses frontmatter text (the YAML between the fences) into an insertion-ordered field map. A YAML parse error is
 * returned rather than thrown; a block that is not a map yields an empty field map.
 */
export function parseFrontmatterFields(text: string): { fields: Record<string, unknown>; error?: string } {
  const doc = parseDocument(text, { schema: 'core' });
  const error = doc.errors[0]?.message;
  if (error !== undefined) {
    return { fields: {}, error };
  }
  const plain: unknown = doc.toJS();
  return { fields: isRecord(plain) ? plain : {} };
}

/** Renders a field map to frontmatter text (no fences), one `key: value` line per entry, in insertion order. */
export function renderFrontmatterFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .flatMap(([key, value]) => renderEntry(key, value))
    .join('\n');
}

// region | Helpers

/** Renders one field entry, delegating non-string scalars, string arrays, and structured values to the serializer. */
function renderEntry(key: string, value: unknown): string[] {
  if (typeof value === 'string') {
    return [`${key}: ${renderScalar(value)}`];
  }
  if (value === null || value === undefined) {
    return [`${key}:`];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [`${key}: ${stringify(value, SCALAR_STRINGIFY_OPTIONS).replace(/\n$/, '')}`];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [`${key}: ${renderFlowList(value)}`];
  }
  // Structured values (nested maps, mixed arrays) round-trip via the `yaml` serializer, which keeps them parse-stable.
  const doc = new Document({ [key]: value });
  return doc.toString({ lineWidth: 0 }).trimEnd().split('\n');
}

/** Renders a string array as a flow-style `[a, b, c]` sequence. */
function renderFlowList(values: readonly string[]): string {
  return `[${values.map((value) => renderScalar(value)).join(', ')}]`;
}

/**
 * Renders a string scalar, delegating the quoting decision to the `yaml` core-schema stringifier so the result
 * re-parses to the same string. A value containing a newline yields a multi-line block scalar that cannot occupy a
 * single `key: value` line, so it is re-rendered as a double-quoted scalar whose `\n` escapes round-trip faithfully.
 */
function renderScalar(value: string): string {
  const rendered = stringify(value, SCALAR_STRINGIFY_OPTIONS).replace(/\n$/, '');
  if (rendered.includes('\n')) {
    return stringify(value, { ...SCALAR_STRINGIFY_OPTIONS, defaultStringType: 'QUOTE_DOUBLE' }).replace(/\n$/, '');
  }
  return rendered;
}

// endregion | Helpers

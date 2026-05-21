import { Document, stringify } from 'yaml';

import type { Frontmatter } from '../types.js';

const FENCE = '---';
// Stringify options for single string scalars. `schema: 'core'` matches the
// parser in `parse-note.ts`, so the library quotes exactly the strings that
// would otherwise re-parse as a non-string (numbers, the special floats
// `.inf`/`.nan`, booleans, `null`/`~`). `defaultStringType: 'PLAIN'` keeps
// round-trip-safe strings unquoted; `singleQuote: true` selects single quotes
// when quoting is unavoidable.
const SCALAR_STRINGIFY_OPTIONS = {
  schema: 'core',
  defaultStringType: 'PLAIN',
  defaultKeyType: 'PLAIN',
  singleQuote: true,
  lineWidth: 0,
} as const;

/**
 * Render frontmatter plus a body back to a note string. Fields are emitted in
 * a fixed order — `title`, `type`, `created`, `updated`, `tags`, then `extra`
 * keys in insertion order — followed by the closing fence and one blank line
 * before the body. Re-parsing the output yields a structurally equal
 * `Frontmatter`.
 */
export function writeFrontmatter(input: { frontmatter: Frontmatter; body: string }): string {
  const { frontmatter, body } = input;

  const extraLines = Object.entries(frontmatter.extra).flatMap(([key, value]) => renderExtraEntry(key, value));

  const lines: string[] = [
    FENCE,
    `title: ${renderScalar(frontmatter.title)}`,
    `type: ${renderScalar(frontmatter.type)}`,
    `created: ${renderScalar(frontmatter.created)}`,
    `updated: ${renderScalar(frontmatter.updated)}`,
    `tags: ${renderFlowList(frontmatter.tags)}`,
    ...extraLines,
    FENCE,
    '',
  ];

  const normalizedBody = body.startsWith('\n') ? body.slice(1) : body;
  return `${lines.join('\n')}\n${normalizedBody}`;
}

// region | Helpers

/** Render an `extra` entry, delegating arrays and objects to the `yaml` serializer. */
function renderExtraEntry(key: string, value: unknown): string[] {
  if (typeof value === 'string') {
    return [`${key}: ${renderScalar(value)}`];
  }
  if (value === null || value === undefined) {
    return [`${key}:`];
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [`${key}: ${String(value)}`];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return [`${key}: ${renderFlowList(value)}`];
  }
  // Structured values (nested maps, mixed arrays) round-trip via the `yaml`
  // serializer, which keeps them parse-stable without hand-rolling emission.
  const doc = new Document({ [key]: value });
  return doc.toString({ lineWidth: 0 }).trimEnd().split('\n');
}

/**
 * Render a string scalar, delegating the quoting decision to the `yaml`
 * library's `core`-schema stringifier so the result re-parses to the same
 * string. The library quotes only when a plain scalar would round-trip to a
 * non-string — covering YAML core integers, floats (including `.inf`/`.nan`),
 * booleans, and `null`/`~` — and leaves safe strings unquoted. A value
 * containing a newline yields a multi-line block scalar, which cannot occupy a
 * single `key: value` line; such values are re-rendered as a double-quoted
 * scalar, whose `\n` escapes keep the value on one line and round-trip the
 * embedded newlines faithfully.
 */
function renderScalar(value: string): string {
  const rendered = stringify(value, SCALAR_STRINGIFY_OPTIONS).replace(/\n$/, '');
  if (rendered.includes('\n')) {
    return stringify(value, { ...SCALAR_STRINGIFY_OPTIONS, defaultStringType: 'QUOTE_DOUBLE' }).replace(/\n$/, '');
  }
  return rendered;
}

/** Render a string array as a flow-style `[a, b, c]` sequence. */
function renderFlowList(values: readonly string[]): string {
  return `[${values.map((value) => renderScalar(value)).join(', ')}]`;
}

// endregion | Helpers

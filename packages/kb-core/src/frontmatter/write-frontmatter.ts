import { Document } from 'yaml';

import type { Frontmatter } from '../types.js';

const FENCE = '---';
// A scalar that starts with one of these characters and contains no YAML-unsafe
// run can be emitted unquoted.
const SAFE_START = /^[A-Za-z0-9_./]/;
const UNSAFE_RUN = /:\s|^\s|\s$|^[!&*?|>%@`"'#-]|[:#]\s*$/;

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

/** Render a string scalar, single-quoting only when YAML safety requires it. */
function renderScalar(value: string): string {
  if (value === '') {
    return "''";
  }
  if (SAFE_START.test(value) && !UNSAFE_RUN.test(value) && !value.includes(': ')) {
    return value;
  }
  return `'${value.replaceAll("'", "''")}'`;
}

/** Render a string array as a flow-style `[a, b, c]` sequence. */
function renderFlowList(values: readonly string[]): string {
  return `[${values.map((value) => renderScalar(value)).join(', ')}]`;
}

// endregion | Helpers

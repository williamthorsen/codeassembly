import yaml from 'js-yaml';

import { isRecord } from './type-guards.ts';

/**
 * Thrown when `rewriteToolNames` encounters a `{tool:NAME}` placeholder whose canonical name has no entry in the
 * supplied mapping. Caught by the install pipeline and surfaced as a fatal install error.
 */
export class ToolNameRewriteError extends Error {
  override readonly name = 'ToolNameRewriteError';
  readonly toolName: string;
  readonly contextLabel: string;
  readonly line: number;

  constructor(toolName: string, contextLabel: string, line: number) {
    super(
      `Unmapped tool name "${toolName}" in ${contextLabel}:${line}. ` +
        `Define ${toolName} in the platform overlay's _tools: mapping.`,
    );
    this.toolName = toolName;
    this.contextLabel = contextLabel;
    this.line = line;
  }
}

/** Matches `{tool:NAME}` placeholders. NAME starts with a letter, then letters/digits/underscores. */
const PLACEHOLDER_RE = /\{tool:([A-Za-z][A-Za-z0-9_]*)}/g;

/**
 * Replaces every `{tool:NAME}` placeholder in `content` with the value bound to `NAME` in `mapping`. An unmapped name
 * throws `ToolNameRewriteError` with the canonical name, `contextLabel`, and the 1-based line number of the offending
 * match. There is no identity pass-through; every match must resolve through the mapping or the call fails.
 */
export function rewriteToolNames(content: string, mapping: ReadonlyMap<string, string>, contextLabel: string): string {
  return content.replace(PLACEHOLDER_RE, (_match: string, toolName: string, offset: number): string => {
    const replacement = mapping.get(toolName);
    if (replacement === undefined) {
      throw new ToolNameRewriteError(toolName, contextLabel, computeLine(content, offset));
    }
    return replacement;
  });
}

/**
 * Parses the top-level `_tools:` key out of an overlay YAML document into a canonical → platform name `Map`.
 * Missing, null, or empty `_tools:` returns an empty `Map`. A non-object `_tools:` or any non-string entry throws.
 */
export function loadToolMapping(overlayYaml: string): Map<string, string> {
  if (overlayYaml.trim() === '') {
    return new Map();
  }
  const parsed: unknown = yaml.load(overlayYaml);
  if (!isRecord(parsed)) {
    return new Map();
  }
  const tools = parsed._tools;
  if (tools === undefined || tools === null) {
    return new Map();
  }
  if (!isRecord(tools)) {
    throw new TypeError(`Invalid _tools: expected mapping object, got ${typeof tools}`);
  }

  const mapping = new Map<string, string>();
  for (const [key, value] of Object.entries(tools)) {
    if (typeof value !== 'string') {
      throw new TypeError(`Invalid _tools entry for "${key}": expected string, got ${typeof value}`);
    }
    mapping.set(key, value);
  }
  return mapping;
}

function computeLine(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (content.codePointAt(i) === 10) {
      line++;
    }
  }
  return line;
}

import { parse as parseYaml } from 'yaml';

import { isRecord } from './type-guards.ts';

/** Result of parsing a markdown file's frontmatter. */
interface ParsedFrontmatter {
  /** Ordered list of frontmatter key-value lines (without `---` delimiters). */
  readonly lines: ReadonlyArray<string>;
  /** The agent name extracted from the `name:` field. */
  readonly agentName: string;
  /** Everything after the closing `---`, including the leading newline. */
  readonly body: string;
}

/**
 * Parses a markdown file into its frontmatter lines, agent name, and body.
 * The frontmatter is the content between the first and second `---` lines.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const rawLines = content.split('\n');
  const fmLines: Array<string> = [];
  let body = '';
  let delimiterCount = 0;
  let bodyStartIndex = -1;

  for (const [i, line] of rawLines.entries()) {
    if (line === '---') {
      delimiterCount++;
      if (delimiterCount === 2) {
        bodyStartIndex = i + 1;
        break;
      }
      continue;
    }
    if (delimiterCount === 1) {
      fmLines.push(line);
    }
  }

  if (bodyStartIndex >= 0 && bodyStartIndex < rawLines.length) {
    body = rawLines.slice(bodyStartIndex).join('\n');
  }

  let agentName = '';
  for (const line of fmLines) {
    const match = /^name:\s*(.+)$/.exec(line);
    if (match?.[1]) {
      agentName = match[1];
      break;
    }
  }

  return { lines: fmLines, agentName, body };
}

/**
 * Parses the overlay YAML file and returns the merged overrides for a given agent.
 * `_defaults` are applied first, then agent-specific values override them.
 */
export function parseOverlayOverrides(overlayYaml: string, agentName: string): Record<string, string> {
  const parsed: unknown = parseYaml(overlayYaml);
  if (!isRecord(parsed)) {
    return {};
  }

  const overrides: Record<string, string> = {};

  const defaults = parsed._defaults;
  if (isRecord(defaults)) {
    applyOverrides(overrides, defaults);
  }

  // Agent-specific values win over the defaults applied above.
  if (agentName) {
    const agentSection = parsed[agentName];
    if (isRecord(agentSection)) {
      applyOverrides(overrides, agentSection);
    }
  }

  return overrides;
}

/** Converts override values to their YAML string representation. */
function applyOverrides(target: Record<string, string>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) {
      continue;
    }
    target[key] = serializeScalar(value);
  }
}

/** Serializes a value to its YAML string representation; an array renders as a flow sequence (`[a, b, c]`). */
function serializeScalar(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map(String);
    return `[${items.join(', ')}]`;
  }
  return String(value);
}

/**
 * Merges harness-specific frontmatter overrides into a subagent markdown file. A matching key is replaced in place, a
 * new key is appended in alphabetical order, and the body is preserved verbatim.
 */
export function mergeFrontmatter(source: string, overlayYaml: string): string {
  const { lines, agentName, body } = parseFrontmatter(source);
  const overrides = parseOverlayOverrides(overlayYaml, agentName);

  if (Object.keys(overrides).length === 0) {
    return source;
  }

  // The line-based replacement handles scalar and inline-sequence values (e.g. `tools: [a, b, c]`) alone. An overlay
  // key targeting a YAML block sequence in the source (e.g. `skills:` followed by indented `- item` lines) replaces
  // the key line while its continuation lines remain, producing malformed YAML. Overlay files therefore use
  // inline flow-sequence notation exclusively.
  const applied = new Set<string>();
  const mergedLines: Array<string> = [];

  for (const line of lines) {
    let replaced = false;
    for (const [key, value] of Object.entries(overrides)) {
      if (line.startsWith(`${key}: `) || line === `${key}:`) {
        mergedLines.push(`${key}: ${value}`);
        applied.add(key);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      mergedLines.push(line);
    }
  }

  const newKeys = Object.keys(overrides)
    .filter((key) => !applied.has(key))
    .toSorted();

  for (const key of newKeys) {
    const value = overrides[key];
    if (value !== undefined) {
      mergedLines.push(`${key}: ${value}`);
    }
  }

  const parts = ['---\n'];
  for (const line of mergedLines) {
    parts.push(line + '\n');
  }
  parts.push('---\n', body);

  return parts.join('');
}

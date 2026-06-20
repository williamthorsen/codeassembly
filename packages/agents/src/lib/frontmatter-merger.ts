import { parse as parseYaml } from 'yaml';

import { isRecord } from './type-guards.ts';

/**
 * Result of parsing a markdown file's frontmatter.
 */
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

  // Extract agent name
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

  // Apply _defaults
  const defaults = parsed._defaults;
  if (isRecord(defaults)) {
    applyOverrides(overrides, defaults);
  }

  // Apply agent-specific overrides (agent wins over defaults)
  if (agentName) {
    const agentSection = parsed[agentName];
    if (isRecord(agentSection)) {
      applyOverrides(overrides, agentSection);
    }
  }

  return overrides;
}

/**
 * Converts override values to their YAML string representation.
 * Arrays are serialized as flow sequences (inline).
 */
function applyOverrides(target: Record<string, string>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) {
      continue;
    }
    target[key] = serializeScalar(value);
  }
}

/**
 * Serializes a value to its YAML string representation.
 * Arrays are rendered as flow sequences: `[a, b, c]`.
 * Scalars are rendered as-is.
 */
function serializeScalar(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map(String);
    return `[${items.join(', ')}]`;
  }
  return String(value);
}

/**
 * Merges harness-specific frontmatter overrides into a subagent markdown file.
 *
 * Replicates the behavior of `merge_frontmatter` from `sync-agent-files.sh`:
 * 1. Parse source frontmatter and extract agent name
 * 2. Read _defaults and agent-specific overrides from overlay YAML
 * 3. Replace matching keys in-place in frontmatter
 * 4. Append new keys sorted alphabetically
 * 5. Preserve body verbatim
 *
 * @param source The source markdown content.
 * @param overlayYaml The overlay YAML content for the target harness.
 * @returns The merged markdown content.
 */
export function mergeFrontmatter(source: string, overlayYaml: string): string {
  const { lines, agentName, body } = parseFrontmatter(source);
  const overrides = parseOverlayOverrides(overlayYaml, agentName);

  // If no overrides, return source unchanged
  if (Object.keys(overrides).length === 0) {
    return source;
  }

  // Replace matching keys in-place.
  // LIMITATION: This line-based replacement only handles scalar and inline-sequence values (e.g., `tools: [a, b, c]`).
  // If an overlay key targets a YAML block sequence in the source (e.g., `skills:` followed by indented `- item`
  // lines), only the key line is replaced while the continuation lines remain, producing malformed YAML.
  // Current overlay files avoid this by using inline flow-sequence notation exclusively.
  // If block-sequence overrides are needed in the future, replace this with structured YAML parsing (e.g., yaml's
  // parse/stringify) instead of line-by-line replacement.
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

  // Append new keys (not already in source) in sorted order
  const newKeys = Object.keys(overrides)
    .filter((key) => !applied.has(key))
    .toSorted();

  for (const key of newKeys) {
    const value = overrides[key];
    if (value !== undefined) {
      mergedLines.push(`${key}: ${value}`);
    }
  }

  // Reassemble
  const parts = ['---\n'];
  for (const line of mergedLines) {
    parts.push(line + '\n');
  }
  parts.push('---\n', body);

  return parts.join('');
}

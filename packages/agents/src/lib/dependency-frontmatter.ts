import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ARTIFACT_TYPES, type ArtifactType } from './artifact-types.ts';
import { EntrySchema } from './codeassembly-schema.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { isRecord } from './type-guards.ts';

/** The artifacts one artifact depends on, grouped by type. An absent type carries no edge. */
export type ArtifactDependencies = Partial<Record<ArtifactType, ReadonlyArray<string>>>;

/** A collection's constituents: the computed whole library, or an explicit per-type edge set. */
export type MembersResult = { kind: 'library' } | { kind: 'explicit'; edges: ArtifactDependencies };

/** The computed token a collection's `members:` may carry to mean every deployable artifact in the library. */
const LIBRARY_TOKEN = '@library';

/** Maps a plural declaration key (`skills`) back to its artifact type (`skill`), the inverse of `ARTIFACT_TYPES`. */
const TYPE_BY_KEY: Record<string, ArtifactType> = {};
for (const meta of Object.values(ARTIFACT_TYPES)) {
  TYPE_BY_KEY[meta.key] = meta.type;
}

/**
 * Reads a non-collection artifact's `dependencies:` frontmatter block — the prerequisite edges resolution follows
 * transitively. The block groups slugs by their plural type key (`rulebooks`, `skills`, `subagents`, `collections`);
 * each entry is a bare slug or a `{ name }` object (extra keys tolerated). Absent frontmatter, an absent block, or a
 * null value all resolve to no dependencies. A `members:` key is collections-only and throws here; an unknown type
 * key or a non-list value also throws. Every error names `sourceLabel` when provided.
 */
export function readDependencies(content: string, sourceLabel?: string): ArtifactDependencies {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return {};
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  // `members:` belongs to collections; a rulebook, skill, or subagent carrying it has misplaced a key, not an edge.
  if (parsed.members !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: "members:" is only valid on collections; declare prerequisite edges via "dependencies:".`,
    );
  }
  if (parsed.dependencies === undefined || parsed.dependencies === null) {
    return {};
  }

  const block = parsed.dependencies;
  if (!isRecord(block)) {
    throw new Error(`Invalid dependencies${where}: expected a mapping of artifact type to a list of slugs.`);
  }
  return parseTypeBlock(block, `Invalid dependencies${where}`);
}

/**
 * Reads a subagent's top-level `skills:` frontmatter — the runtime injection list the harness loads into the
 * subagent's context. Each entry is a bare slug or a `{ name }` object (extra keys tolerated). Absent frontmatter,
 * an absent `skills:` key, or a null value all resolve to no injected skills. A non-list value throws, naming
 * `sourceLabel` when provided.
 */
export function readInjectedSkills(content: string, sourceLabel?: string): ReadonlyArray<string> {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return [];
  }
  if (parsed.skills === undefined || parsed.skills === null) {
    return [];
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  const entries = z.array(EntrySchema).safeParse(parsed.skills);
  if (!entries.success) {
    throw new Error(`Invalid skills${where}: "skills" must be a list of slugs.`);
  }
  return entries.data.map((entry) => entry.name);
}

/**
 * Reads a collection's `members:` frontmatter — its constituents, which resolution follows transitively. The value
 * is either the computed token `'@library'` (every deployable artifact, expanded by the resolver) or an explicit
 * per-type mapping in the same shape `dependencies:` uses. Absent or null members is an empty collection, not an
 * error. A `dependencies:` key is rejected here (membership moved to `members:`); an unrecognized token or a value
 * that is neither a token nor a mapping also throws. Every error names `sourceLabel` when provided.
 */
export function readMembers(content: string, sourceLabel?: string): MembersResult {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return { kind: 'explicit', edges: {} };
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  // A collection's constituents live under `members:`; a `dependencies:` key is the pre-migration spelling, not an edge.
  if (parsed.dependencies !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: a collection declares its constituents via "members:", not "dependencies:".`,
    );
  }

  const members = parsed.members;
  if (members === undefined || members === null) {
    return { kind: 'explicit', edges: {} };
  }
  if (typeof members === 'string') {
    if (members === LIBRARY_TOKEN) {
      return { kind: 'library' };
    }
    throw new Error(
      `Invalid members${where}: unrecognized token "${members}"; the only supported token is '${LIBRARY_TOKEN}'.`,
    );
  }
  if (isRecord(members)) {
    return { kind: 'explicit', edges: parseTypeBlock(members, `Invalid members${where}`) };
  }
  throw new Error(
    `Invalid members${where}: expected '${LIBRARY_TOKEN}' or a mapping of artifact type to a list of slugs.`,
  );
}

// region | Helpers

/**
 * Parses a per-type block (`rulebooks`/`skills`/`subagents`/`collections` → slug lists) into edges. Each entry is a
 * bare slug or a `{ name }` object (extra keys tolerated); a null sub-key contributes no edges of that type.
 * `errorPrefix` opens each message so the caller names its own key (`dependencies:` or `members:`). Throws on an
 * unknown type key or a non-list value.
 */
function parseTypeBlock(block: Record<string, unknown>, errorPrefix: string): ArtifactDependencies {
  const edges: { [Type in ArtifactType]?: ReadonlyArray<string> } = {};
  for (const [key, value] of Object.entries(block)) {
    const type = TYPE_BY_KEY[key];
    if (type === undefined) {
      throw new Error(`${errorPrefix}: unknown type "${key}"; expected one of ${Object.keys(TYPE_BY_KEY).join(', ')}.`);
    }
    // A sub-key with no list (`skills:`, e.g. all entries commented out) declares no edges of that type, not an error.
    if (value === null) {
      continue;
    }
    const entries = z.array(EntrySchema).safeParse(value);
    if (!entries.success) {
      throw new Error(`${errorPrefix}: "${key}" must be a list of slugs.`);
    }
    edges[type] = entries.data.map((entry) => entry.name);
  }
  return edges;
}

// endregion | Helpers

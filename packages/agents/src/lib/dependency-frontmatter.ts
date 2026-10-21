import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ARTIFACT_TYPES, type ArtifactType } from './artifact-types.ts';
import { EntrySchema } from './codeassembly-schema.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { isRecord } from './type-guards.ts';

/** The artifacts on which one artifact depends, grouped by type. An absent type does not contribute an edge. */
export type ArtifactDependencies = Partial<Record<ArtifactType, ReadonlyArray<string>>>;

/** The claim that a collection's membership makes about its members. */
export type Disposition = (typeof DISPOSITIONS)[number];

/**
 * A collection's constituents: every artifact of the collection's own source, every artifact of it that no
 * disposition claims, or an explicit per-type edge set.
 */
export type MembersResult =
  { kind: 'library' } | { kind: 'unclaimed' } | { kind: 'explicit'; edges: ArtifactDependencies };

/** The values that a collection's `disposition:` may declare. */
export const DISPOSITIONS = ['opt-in', 'personal', 'public'] as const;

/** The computed token that a collection's `members:` may name to mean every deployable artifact in its own source. */
const LIBRARY_TOKEN = '@library';

/**
 * The computed token that a collection's `members:` may name to mean every deployable artifact in its own source that
 * neither a dispositioned collection enumerates nor declares itself standalone.
 */
export const UNCLAIMED_TOKEN = '@unclaimed';

/** Maps a plural declaration key (`skills`) back to its artifact type (`skill`), the inverse of `ARTIFACT_TYPES`. */
const TYPE_BY_KEY: Record<string, ArtifactType> = {};
for (const meta of Object.values(ARTIFACT_TYPES)) {
  TYPE_BY_KEY[meta.key] = meta.type;
}

/**
 * Reads a collection's `disposition:`, or `undefined` for a plain bundle that does not declare one. Throws on a value
 * outside `DISPOSITIONS`, and on a disposition declared by a collection whose `members:` is computed, since a computed
 * set does not enumerate anything for the claim to cover.
 */
export function readCollectionDisposition(content: string, sourceLabel?: string): Disposition | undefined {
  const parsed = readFrontmatterRecord(content);
  const disposition = parsed['disposition'];
  if (disposition === undefined || disposition === null) {
    return undefined;
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  const known = DISPOSITIONS.find((value) => value === disposition);
  if (known === undefined) {
    throw new Error(
      `Invalid disposition${where}: ${JSON.stringify(disposition)}; expected one of ${DISPOSITIONS.join(', ')}.`,
    );
  }
  if (readMembers(content, sourceLabel).kind !== 'explicit') {
    throw new Error(
      `Invalid frontmatter${where}: a collection whose members are computed does not declare "disposition:"; only an enumerated membership makes a claim.`,
    );
  }
  return known;
}

/**
 * Reads a non-collection artifact's `dependencies:` frontmatter block -- the prerequisite edges that resolution
 * follows transitively. The block groups slugs by their plural type key (`rulebooks`, `skills`, `subagents`, `collections`);
 * each entry is a bare slug or a `{ name }` object (extra keys tolerated). Absent frontmatter, an absent block, or a
 * null value all resolve to an empty set of dependencies. A `members:` key is collections-only and throws here; an
 * unknown type key or a non-list value also throws. Every error names `sourceLabel` when provided.
 */
export function readDependencies(content: string, sourceLabel?: string): ArtifactDependencies {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return {};
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  // `members:` belongs to collections; a rulebook, skill, or subagent declaring it has misplaced a key, not an edge.
  if (parsed['members'] !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: "members:" is only valid on collections; declare prerequisite edges via "dependencies:".`,
    );
  }
  if (parsed['disposition'] !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: "disposition:" is only valid on collections; an artifact outside every collection declares "standalone:".`,
    );
  }
  if (parsed['dependencies'] === undefined || parsed['dependencies'] === null) {
    return {};
  }

  const block = parsed['dependencies'];
  if (!isRecord(block)) {
    throw new Error(`Invalid dependencies${where}: expected a mapping of artifact type to a list of slugs.`);
  }
  return parseTypeBlock(block, `Invalid dependencies${where}`);
}

/**
 * Reads a subagent's top-level `rulebooks:` frontmatter -- the rulebooks whose deployed skills the render pass merges
 * into `skills:`, and which resolution pulls into the closure. Shape and leniency match `readInjectedSkills`; the two
 * lists differ only in which namespace their slugs resolve against.
 */
export function readInjectedRulebooks(content: string, sourceLabel?: string): ReadonlyArray<string> {
  return readInjectionList(content, 'rulebooks', sourceLabel);
}

/**
 * Reads a subagent's top-level `skills:` frontmatter -- the runtime injection list that the harness loads into the
 * subagent's context. Each entry is a bare slug or a `{ name }` object (extra keys tolerated). Absent frontmatter,
 * an absent `skills:` key, or a null value all resolve to an empty list of injected skills. A non-list value
 * throws, naming `sourceLabel` when provided.
 */
export function readInjectedSkills(content: string, sourceLabel?: string): ReadonlyArray<string> {
  return readInjectionList(content, 'skills', sourceLabel);
}

/**
 * Reads a collection's `members:` frontmatter -- its constituents, which resolution follows transitively. The value
 * is either the computed token `'@library'` (every deployable artifact, expanded by the resolver) or an explicit
 * per-type mapping in the same shape that `dependencies:` uses. Absent or null members is an empty collection, not an
 * error. A `dependencies:` key is rejected here; an unrecognized token or a value
 * that is neither a token nor a mapping also throws. Every error names `sourceLabel` when provided.
 */
export function readMembers(content: string, sourceLabel?: string): MembersResult {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return { kind: 'explicit', edges: {} };
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  // A collection's constituents are declared under `members:`; a `dependencies:` key there is a misplaced key, not
  // an edge.
  if (parsed['dependencies'] !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: a collection declares its constituents via "members:", not "dependencies:".`,
    );
  }
  if (parsed['standalone'] !== undefined) {
    throw new Error(
      `Invalid frontmatter${where}: "standalone:" is only valid on an artifact that no collection contains, not on a collection.`,
    );
  }

  const members = parsed['members'];
  if (members === undefined || members === null) {
    return { kind: 'explicit', edges: {} };
  }
  if (typeof members === 'string') {
    if (members === LIBRARY_TOKEN) {
      return { kind: 'library' };
    }
    if (members === UNCLAIMED_TOKEN) {
      return { kind: 'unclaimed' };
    }
    throw new Error(
      `Invalid members${where}: unrecognized token "${members}"; the supported tokens are '${LIBRARY_TOKEN}' and '${UNCLAIMED_TOKEN}'.`,
    );
  }
  if (isRecord(members)) {
    return { kind: 'explicit', edges: parseTypeBlock(members, `Invalid members${where}`) };
  }
  throw new Error(
    `Invalid members${where}: expected '${LIBRARY_TOKEN}', '${UNCLAIMED_TOKEN}', or a mapping of artifact type to a list of slugs.`,
  );
}

/**
 * Reads a rulebook's, skill's, or subagent's `standalone:` reason, or `undefined` when it does not declare one. The
 * reason is what makes the absence from every collection a decision, so a value that is not a non-empty string throws.
 */
export function readStandaloneReason(content: string, sourceLabel?: string): string | undefined {
  const reason = readFrontmatterRecord(content)['standalone'];
  if (reason === undefined) {
    return undefined;
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
    throw new Error(
      `Invalid standalone${where}: expected the reason that the artifact stands alone, as a non-empty string.`,
    );
  }
  return reason;
}

// region | Helpers

/**
 * Parses a per-type block (`rulebooks`/`skills`/`subagents`/`collections` → slug lists) into edges. Each entry is a
 * bare slug or a `{ name }` object (extra keys tolerated); a null sub-key does not contribute any edges of that
 * type. `errorPrefix` opens each message so that the caller names its own key (`dependencies:` or `members:`). Throws
 * on an unknown type key or a non-list value.
 */
function parseTypeBlock(block: Record<string, unknown>, errorPrefix: string): ArtifactDependencies {
  const edges: { [Type in ArtifactType]?: ReadonlyArray<string> } = {};
  for (const [key, value] of Object.entries(block)) {
    const type = TYPE_BY_KEY[key];
    if (type === undefined) {
      throw new Error(`${errorPrefix}: unknown type "${key}"; expected one of ${Object.keys(TYPE_BY_KEY).join(', ')}.`);
    }
    // A sub-key without a list (`skills:`, e.g. all entries commented out) does not declare any edges of that type,
    // and it is not an error.
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

/** Parses the frontmatter block into a record, empty when the content does not have one. */
function readFrontmatterRecord(content: string): Record<string, unknown> {
  const parsed: unknown = parseYaml(parseFrontmatter(content).lines.join('\n'));
  return isRecord(parsed) ? parsed : {};
}

/**
 * Reads one top-level injection list, whose entries are bare slugs or `{ name }` objects (extra keys tolerated).
 * Absent frontmatter, an absent key, and a null value all resolve to an empty list; a non-list value throws.
 */
function readInjectionList(content: string, key: string, sourceLabel?: string): ReadonlyArray<string> {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed)) {
    return [];
  }
  const value = parsed[key];
  if (value === undefined || value === null) {
    return [];
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  const entries = z.array(EntrySchema).safeParse(value);
  if (!entries.success) {
    throw new Error(`Invalid ${key}${where}: "${key}" must be a list of slugs.`);
  }
  return entries.data.map((entry) => entry.name);
}

// endregion | Helpers

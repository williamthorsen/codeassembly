import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { ARTIFACT_TYPES, type ArtifactType } from './artifact-types.ts';
import { EntrySchema } from './codeassembly-schema.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { isRecord } from './type-guards.ts';

/** The artifacts one artifact depends on, grouped by type. An absent type carries no edge. */
export type ArtifactDependencies = Partial<Record<ArtifactType, ReadonlyArray<string>>>;

/** Maps a plural declaration key (`skills`) back to its artifact type (`skill`), the inverse of `ARTIFACT_TYPES`. */
const TYPE_BY_KEY: Record<string, ArtifactType> = {};
for (const meta of Object.values(ARTIFACT_TYPES)) {
  TYPE_BY_KEY[meta.key] = meta.type;
}

/**
 * Reads an artifact's `dependencies:` frontmatter block — the edges to other artifacts that resolution follows
 * transitively. The block groups slugs by their plural type key (`rulebooks`, `skills`, `subagents`, `collections`);
 * each entry is a bare slug or a `{ name }` object (extra keys tolerated). Absent frontmatter, an absent block, or a
 * null value all resolve to no dependencies. An unknown type key or a non-list value throws a clear error, naming
 * `sourceLabel` when provided.
 */
export function readDependencies(content: string, sourceLabel?: string): ArtifactDependencies {
  const { lines } = parseFrontmatter(content);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed) || parsed.dependencies === undefined || parsed.dependencies === null) {
    return {};
  }

  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
  const block = parsed.dependencies;
  if (!isRecord(block)) {
    throw new Error(`Invalid dependencies${where}: expected a mapping of artifact type to a list of slugs.`);
  }

  const dependencies: { [Type in ArtifactType]?: ReadonlyArray<string> } = {};
  for (const [key, value] of Object.entries(block)) {
    const type = TYPE_BY_KEY[key];
    if (type === undefined) {
      throw new Error(
        `Invalid dependencies${where}: unknown type "${key}"; expected one of ${Object.keys(TYPE_BY_KEY).join(', ')}.`,
      );
    }
    // A sub-key with no list (`skills:`, e.g. all entries commented out) declares no edges of that type, not an error.
    if (value === null) {
      continue;
    }
    const entries = z.array(EntrySchema).safeParse(value);
    if (!entries.success) {
      throw new Error(`Invalid dependencies${where}: "${key}" must be a list of slugs.`);
    }
    dependencies[type] = entries.data.map((entry) => entry.name);
  }
  return dependencies;
}

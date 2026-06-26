import path from 'node:path';

/**
 * The artifact-type axis, shared by the declaration parser, the dependency resolver, and `library list`. This is the
 * single source of truth: the type union and the per-type metadata (its plural declaration key and its library
 * subdirectory) live here, so no consumer hardcodes the spelling or the path.
 */
export type ArtifactType = 'rulebook' | 'skill' | 'subagent' | 'collection';

/** Per-type metadata: its own `type`, the plural `key` used as a YAML/declaration key, and its library `contentPath`. */
export interface ArtifactTypeMeta {
  readonly type: ArtifactType;
  readonly key: string;
  readonly contentPath: string;
}

/** The single source of truth for each artifact type's declaration key and library location. */
export const ARTIFACT_TYPES: Record<ArtifactType, ArtifactTypeMeta> = {
  rulebook: { type: 'rulebook', key: 'rulebooks', contentPath: 'guidance/rulebooks' },
  skill: { type: 'skill', key: 'skills', contentPath: 'skills' },
  subagent: { type: 'subagent', key: 'subagents', contentPath: 'subagents' },
  collection: { type: 'collection', key: 'collections', contentPath: 'collections' },
};

/** Every artifact type, for typed iteration over the axis. */
export const ARTIFACT_TYPE_VALUES: ReadonlyArray<ArtifactType> = Object.values(ARTIFACT_TYPES).map((meta) => meta.type);

/** The path, relative to the content dir, of the file holding a `(type, slug)` artifact's frontmatter. */
export function artifactFrontmatterPath(type: ArtifactType, slug: string): string {
  const { contentPath } = ARTIFACT_TYPES[type];
  // Skills are directory-based (`<slug>/SKILL.md`); every other type is a flat `<slug>.md`.
  return type === 'skill' ? path.join(contentPath, slug, 'SKILL.md') : path.join(contentPath, `${slug}.md`);
}

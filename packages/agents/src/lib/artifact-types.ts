import path from 'node:path';

/** The kinds of artifact that the library holds. */
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

export const ARTIFACT_TYPE_VALUES: ReadonlyArray<ArtifactType> = Object.values(ARTIFACT_TYPES).map((meta) => meta.type);

/** The path, relative to the content dir, of the file containing a `(type, slug)` artifact's frontmatter. */
export function artifactFrontmatterPath(type: ArtifactType, slug: string): string {
  const { contentPath } = ARTIFACT_TYPES[type];
  return type === 'skill' ? path.join(contentPath, slug, 'SKILL.md') : path.join(contentPath, `${slug}.md`);
}

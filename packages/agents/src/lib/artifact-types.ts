/**
 * The artifact-type axis, shared by the declaration parser, the dependency resolver, and `library list`. This is the
 * single source of truth: the type union and the per-type metadata (its plural declaration key and its library
 * subdirectory) live here, so no consumer hardcodes the spelling or the path.
 */
export type ArtifactType = 'rulebook' | 'skill' | 'subagent';

/** Per-type metadata: `key` is the plural spelling used as a YAML/declaration key; `contentPath` is the library subdir. */
export const ARTIFACT_TYPES: Record<ArtifactType, { readonly key: string; readonly contentPath: string }> = {
  rulebook: { key: 'rulebooks', contentPath: 'guidance/rulebooks' },
  skill: { key: 'skills', contentPath: 'skills' },
  subagent: { key: 'subagents', contentPath: 'subagents' },
};

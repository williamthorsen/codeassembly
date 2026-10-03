import { type ArtifactType, readArtifact } from 'codeassembly/api';

import { CONTENT_ROOT } from './content-root.ts';

/**
 * Reads a list-valued frontmatter field of a library artifact, such as a subagent's `skills:` or a rulebook's
 * `delivery:`. A scalar reads as a one-item list and an absent field as an empty one; any other shape throws.
 */
export async function readFrontmatterList(
  type: ArtifactType,
  slug: string,
  key: string,
): Promise<ReadonlyArray<string>> {
  const value = (await readArtifact(CONTENT_ROOT, type, slug)).frontmatter[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value;
  }
  throw new Error(`The \`${key}:\` field of ${type} "${slug}" is not a list of strings`);
}

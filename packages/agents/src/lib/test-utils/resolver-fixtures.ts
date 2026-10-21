import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import { createSourceResolver, type SourceResolver } from '../content-sources.ts';
import type { DirectArtifacts } from '../dependency-resolver.ts';

/** Builds a resolver over the one source `dir`, named as the fixture library is. */
export function buildSingleSourceResolver(dir: string): SourceResolver {
  return createSourceResolver([{ name: 'codeassembly', dir }]);
}

/**
 * Writes an artifact's frontmatter file under `contentDir`. A collection's edges render as `members:` (either the
 * `'@library'` token or a per-type block); every other type's render as `dependencies:`. Omit `edges` for a leaf.
 */
export async function writeArtifact(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  edges?: DirectArtifacts | '@library',
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderEdges(type, edges)}---\n\n# ${slug}\n`, 'utf8');
}

/**
 * Writes an artifact's file with a custom body following the frontmatter. Unlike `writeArtifact` (which emits a bare
 * `# <slug>` body), this lets a test place invocation tokens or include directives in the body.
 */
export async function writeArtifactWithBody(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  body: string,
  edges?: DirectArtifacts,
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderEdges(type, edges)}---\n\n${body}\n`, 'utf8');
}

/** Writes an artifact whose frontmatter, after its `name:`, is `frontmatter` verbatim. */
export async function writeRawArtifact(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  frontmatter: string,
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${frontmatter}\n---\n\n# ${slug}\n`, 'utf8');
}

/**
 * Writes a partial beside the rulebooks: the include target expanded by a rulebook body, resolved against its own dir.
 */
export async function writeRulebookPartial(contentDir: string, name: string, body: string): Promise<void> {
  const filePath = path.join(contentDir, 'guidance', 'rulebooks', '_partials', name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${body}\n`, 'utf8');
}

/** Writes a partial inside a skill's `_partials/` directory: the include target expanded by a skill body. */
export async function writeSkillPartial(
  contentDir: string,
  skillSlug: string,
  name: string,
  body: string,
): Promise<void> {
  const filePath = path.join(contentDir, 'skills', skillSlug, '_partials', name);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${body}\n`, 'utf8');
}

/**
 * Writes a subagent frontmatter file declaring a top-level `skills:` injection list, plus optional `dependencies:`
 * edges. Distinct from `writeArtifact`, which never emits the top-level `skills:` field.
 */
export async function writeSubagent(
  contentDir: string,
  slug: string,
  injects: ReadonlyArray<string>,
  edges?: DirectArtifacts,
  injectedRulebooks: ReadonlyArray<string> = [],
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath('subagent', slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  const injected = injects.map((skill) => `  - ${skill}`).join('\n');
  const rulebookBlock =
    injectedRulebooks.length === 0 ? '' : `rulebooks:\n${injectedRulebooks.map((slug) => `  - ${slug}`).join('\n')}\n`;
  const frontmatter = `name: ${slug}\nskills:\n${injected}\n${rulebookBlock}${renderEdges('subagent', edges)}`;
  await writeFile(filePath, `---\n${frontmatter}---\n\n# ${slug}\n`, 'utf8');
}

// region | Helpers

/** Renders an artifact's edge block: `members:` for a collection, `dependencies:` otherwise; empty when there are none. */
function renderEdges(type: ArtifactType, edges: DirectArtifacts | '@library' | undefined): string {
  if (edges === '@library') {
    return `members: '@library'\n`;
  }
  const key = type === 'collection' ? 'members' : 'dependencies';
  const lines: Array<string> = [];
  for (const edgeType of ARTIFACT_TYPE_VALUES) {
    const slugs = edges?.[edgeType] ?? [];
    if (slugs.length === 0) continue;

    const items = slugs.map((slug) => `    - ${slug}`).join('\n');
    lines.push(`  ${ARTIFACT_TYPES[edgeType].key}:\n${items}`);
  }
  return lines.length === 0 ? '' : `${key}:\n${lines.join('\n')}\n`;
}

// endregion | Helpers

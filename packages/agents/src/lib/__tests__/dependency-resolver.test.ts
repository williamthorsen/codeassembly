import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ARTIFACT_TYPE_VALUES, ARTIFACT_TYPES, artifactFrontmatterPath, type ArtifactType } from '../artifact-types.ts';
import { type DirectArtifacts, resolveClosure } from '../dependency-resolver.ts';

describe(resolveClosure, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-resolver-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('passes through directly-declared leaf artifacts that declare no dependencies', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');

    const closure = await resolveClosure({ skill: ['people-report'], subagent: ['canary'] }, contentDir);

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('expands a collection into its members and drops the collection from the result', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['people-report'], subagent: ['canary'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, contentDir);

    expect(closure).toEqual({ rulebooks: [], skills: ['people-report'], subagents: ['canary'] });
  });

  it('resolves a collection that depends on another collection transitively', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'base', { rulebook: ['typescript-conventions'] });
    await writeArtifact(contentDir, 'collection', 'recommended', { collection: ['base'], skill: ['people-report'] });

    const closure = await resolveClosure({ collection: ['recommended'] }, contentDir);

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('deduplicates a diamond dependency so each member appears once', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'right', { skill: ['shared'] });
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, contentDir);

    expect(closure.skills).toEqual(['shared']);
  });

  it('follows a dependency edge declared by a non-collection artifact', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report', { rulebook: ['typescript-conventions'] });

    const closure = await resolveClosure({ skill: ['people-report'] }, contentDir);

    expect(closure).toEqual({ rulebooks: ['typescript-conventions'], skills: ['people-report'], subagents: [] });
  });

  it('throws naming the cycle when dependencies form a loop', async () => {
    await writeArtifact(contentDir, 'collection', 'a', { collection: ['b'] });
    await writeArtifact(contentDir, 'collection', 'b', { collection: ['a'] });

    await expect(resolveClosure({ collection: ['a'] }, contentDir)).rejects.toThrow(
      /cycle.*collection:a → collection:b → collection:a/s,
    );
  });

  it('throws naming the type and slug when a referenced artifact is missing', async () => {
    await writeArtifact(contentDir, 'collection', 'recommended', { skill: ['ghost'] });

    await expect(resolveClosure({ collection: ['recommended'] }, contentDir)).rejects.toThrow(
      /skill "ghost" was not found/,
    );
  });
});

/** Writes an artifact's frontmatter file under `contentDir`, optionally with a `dependencies:` block. */
async function writeArtifact(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  dependencies?: DirectArtifacts,
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderDependencies(dependencies)}---\n\n# ${slug}\n`, 'utf8');
}

/** Renders a `dependencies:` frontmatter block from a per-type slug map, or an empty string when there are none. */
function renderDependencies(dependencies: DirectArtifacts | undefined): string {
  const lines: Array<string> = [];
  for (const type of ARTIFACT_TYPE_VALUES) {
    const slugs = dependencies?.[type] ?? [];
    if (slugs.length > 0) {
      const items = slugs.map((slug) => `    - ${slug}`).join('\n');
      lines.push(`  ${ARTIFACT_TYPES[type].key}:\n${items}`);
    }
  }
  return lines.length === 0 ? '' : `dependencies:\n${lines.join('\n')}\n`;
}

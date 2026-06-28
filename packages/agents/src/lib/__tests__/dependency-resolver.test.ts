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

  it('resolves a collection whose members is @library to the full deployable catalog', async () => {
    await writeArtifact(contentDir, 'rulebook', 'typescript-conventions');
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'subagent', 'canary');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const closure = await resolveClosure({ collection: ['all'] }, contentDir);

    expect(closure.rulebooks.toSorted()).toEqual(['typescript-conventions']);
    expect(closure.skills.toSorted()).toEqual(['people-report']);
    expect(closure.subagents.toSorted()).toEqual(['canary']);
  });

  it('includes a newly added artifact in @library with no edit to the collection', async () => {
    await writeArtifact(contentDir, 'skill', 'people-report');
    await writeArtifact(contentDir, 'collection', 'all', '@library');

    const before = await resolveClosure({ collection: ['all'] }, contentDir);
    expect(before.skills.toSorted()).toEqual(['people-report']);

    await writeArtifact(contentDir, 'skill', 'classify-complexity');
    const after = await resolveClosure({ collection: ['all'] }, contentDir);

    expect(after.skills.toSorted()).toEqual(['classify-complexity', 'people-report']);
  });

  it('deduplicates @library pulled by two collections under one parent', async () => {
    await writeArtifact(contentDir, 'skill', 'shared');
    await writeArtifact(contentDir, 'collection', 'left', '@library');
    await writeArtifact(contentDir, 'collection', 'right', '@library');
    await writeArtifact(contentDir, 'collection', 'top', { collection: ['left', 'right'] });

    const closure = await resolveClosure({ collection: ['top'] }, contentDir);

    expect(closure.skills).toEqual(['shared']);
  });

  it('throws naming the collection on an unrecognized members token', async () => {
    const filePath = path.join(contentDir, artifactFrontmatterPath('collection', 'bad'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "---\nname: bad\nmembers: '@everything'\n---\n\n# bad\n", 'utf8');

    await expect(resolveClosure({ collection: ['bad'] }, contentDir)).rejects.toThrow(/collection bad.*@everything/s);
  });
});

/**
 * Writes an artifact's frontmatter file under `contentDir`. A collection's edges render as `members:` (either the
 * `'@library'` token or a per-type block); every other type's render as `dependencies:`. Omit `edges` for a leaf.
 */
async function writeArtifact(
  contentDir: string,
  type: ArtifactType,
  slug: string,
  edges?: DirectArtifacts | '@library',
): Promise<void> {
  const filePath = path.join(contentDir, artifactFrontmatterPath(type, slug));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `---\nname: ${slug}\n${renderEdges(type, edges)}---\n\n# ${slug}\n`, 'utf8');
}

/** Renders an artifact's edge block: `members:` for a collection, `dependencies:` otherwise; empty when there are none. */
function renderEdges(type: ArtifactType, edges: DirectArtifacts | '@library' | undefined): string {
  if (edges === '@library') {
    return `members: '@library'\n`;
  }
  const key = type === 'collection' ? 'members' : 'dependencies';
  const lines: Array<string> = [];
  for (const edgeType of ARTIFACT_TYPE_VALUES) {
    const slugs = edges?.[edgeType] ?? [];
    if (slugs.length > 0) {
      const items = slugs.map((slug) => `    - ${slug}`).join('\n');
      lines.push(`  ${ARTIFACT_TYPES[edgeType].key}:\n${items}`);
    }
  }
  return lines.length === 0 ? '' : `${key}:\n${lines.join('\n')}\n`;
}

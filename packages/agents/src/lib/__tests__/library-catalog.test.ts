import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArtifactDependencies } from '../dependency-frontmatter.ts';
import { enumerateLibrarySlugs } from '../library-catalog.ts';

describe(enumerateLibrarySlugs, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-catalog-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('enumerates every visible rulebook, skill, and subagent as a filesystem basename', async () => {
    await writeRulebook(contentDir, 'typescript-conventions');
    await writeRulebook(contentDir, 'commit-conventions');
    await writeSkill(contentDir, 'people-report');
    await writeSubagent(contentDir, 'canary');

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(sortCatalog(catalog)).toEqual({
      rulebook: ['commit-conventions', 'typescript-conventions'],
      skill: ['people-report'],
      subagent: ['canary'],
    });
  });

  it('uses the filesystem basename rather than the frontmatter name', async () => {
    await writeSkill(contentDir, 'aliased-skill', 'a-different-name');
    await writeSubagent(contentDir, 'aliased-subagent', 'a-different-name');

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog.skill).toEqual(['aliased-skill']);
    expect(catalog.subagent).toEqual(['aliased-subagent']);
  });

  it('skips _-prefixed and dotfile entries across every type', async () => {
    await writeRulebook(contentDir, 'typescript-conventions');
    await writeRulebook(contentDir, '_partial');
    await writeSkill(contentDir, 'people-report');
    await writeSkill(contentDir, '_data');
    await writeSubagent(contentDir, 'canary');
    await writeSubagent(contentDir, '.hidden');

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog).toEqual({ rulebook: ['typescript-conventions'], skill: ['people-report'], subagent: ['canary'] });
  });

  it('skips a skill subdirectory that lacks a SKILL.md', async () => {
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(contentDir, 'skills', 'not-a-skill'), { recursive: true });

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog.skill).toEqual(['people-report']);
  });

  it('skips a skill subdirectory whose SKILL.md is itself a directory', async () => {
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(contentDir, 'skills', 'weird', 'SKILL.md'), { recursive: true });

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog.skill).toEqual(['people-report']);
  });

  it('never enumerates collections', async () => {
    await writeSkill(contentDir, 'people-report');
    const collectionsDir = path.join(contentDir, 'collections');
    await mkdir(collectionsDir, { recursive: true });
    await writeFile(path.join(collectionsDir, 'all.md'), "---\nname: all\nmembers: '@library'\n---\n\n# all\n", 'utf8');

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog).not.toHaveProperty('collection');
    expect(catalog).toEqual({ rulebook: [], skill: ['people-report'], subagent: [] });
  });

  it('treats an absent type directory as empty', async () => {
    await writeSkill(contentDir, 'people-report');

    const catalog = await enumerateLibrarySlugs(contentDir);

    expect(catalog).toEqual({ rulebook: [], skill: ['people-report'], subagent: [] });
  });
});

/** Sorts each type's slugs so assertions are independent of filesystem read order. */
function sortCatalog(catalog: ArtifactDependencies): ArtifactDependencies {
  return {
    rulebook: (catalog.rulebook ?? []).toSorted(),
    skill: (catalog.skill ?? []).toSorted(),
    subagent: (catalog.subagent ?? []).toSorted(),
  };
}

/** Writes a fixture rulebook `<slug>.md` under `content/guidance/rulebooks`. */
async function writeRulebook(contentDir: string, slug: string): Promise<void> {
  const dir = path.join(contentDir, 'guidance', 'rulebooks');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n---\n\n# ${slug}\n`, 'utf8');
}

/** Writes a fixture skill `<slug>/SKILL.md` under `content/skills`, with an optionally differing frontmatter name. */
async function writeSkill(contentDir: string, slug: string, name: string = slug): Promise<void> {
  const dir = path.join(contentDir, 'skills', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n\n# ${slug}\n`, 'utf8');
}

/** Writes a fixture subagent `<slug>.md` under `content/subagents`, with an optionally differing frontmatter name. */
async function writeSubagent(contentDir: string, slug: string, name: string = slug): Promise<void> {
  const dir = path.join(contentDir, 'subagents');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${name}\n---\n\n# ${slug}\n`, 'utf8');
}

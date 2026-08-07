import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ArtifactDependencies } from '../dependency-frontmatter.ts';
import { enumerateCatalogSlugs, isSkillDirectory, listSupportEntries } from '../library-catalog.ts';

describe(enumerateCatalogSlugs, () => {
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

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(sortCatalog(catalog)).toEqual({
      rulebook: ['commit-conventions', 'typescript-conventions'],
      skill: ['people-report'],
      subagent: ['canary'],
    });
  });

  it('uses the filesystem basename rather than the frontmatter name', async () => {
    await writeSkill(contentDir, 'aliased-skill', 'a-different-name');
    await writeSubagent(contentDir, 'aliased-subagent', 'a-different-name');

    const catalog = await enumerateCatalogSlugs(contentDir);

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

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(catalog).toEqual({ rulebook: ['typescript-conventions'], skill: ['people-report'], subagent: ['canary'] });
  });

  it('skips a skill subdirectory that lacks a SKILL.md', async () => {
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(contentDir, 'skills', 'not-a-skill'), { recursive: true });

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(catalog.skill).toEqual(['people-report']);
  });

  it('skips a skill subdirectory whose SKILL.md is itself a directory', async () => {
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(contentDir, 'skills', 'weird', 'SKILL.md'), { recursive: true });

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(catalog.skill).toEqual(['people-report']);
  });

  it('never enumerates collections', async () => {
    await writeSkill(contentDir, 'people-report');
    const collectionsDir = path.join(contentDir, 'collections');
    await mkdir(collectionsDir, { recursive: true });
    await writeFile(path.join(collectionsDir, 'all.md'), "---\nname: all\nmembers: '@library'\n---\n\n# all\n", 'utf8');

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(catalog).not.toHaveProperty('collection');
    expect(catalog).toEqual({ rulebook: [], skill: ['people-report'], subagent: [] });
  });

  it('treats an absent type directory as empty', async () => {
    await writeSkill(contentDir, 'people-report');

    const catalog = await enumerateCatalogSlugs(contentDir);

    expect(catalog).toEqual({ rulebook: [], skill: ['people-report'], subagent: [] });
  });
});

describe(isSkillDirectory, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-skilldir-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('recognizes a directory holding a SKILL.md file', async () => {
    await writeSkill(contentDir, 'people-report');

    expect(await isSkillDirectory(path.join(contentDir, 'skills', 'people-report'))).toBe(true);
  });

  it('rejects a directory named SKILL.md, which carries no body to install', async () => {
    await mkdir(path.join(contentDir, 'skills', 'weird', 'SKILL.md'), { recursive: true });

    expect(await isSkillDirectory(path.join(contentDir, 'skills', 'weird'))).toBe(false);
  });

  it('follows a symlinked SKILL.md to the file it points at', async () => {
    await writeSkill(contentDir, 'people-report');
    const linked = path.join(contentDir, 'skills', 'linked');
    await mkdir(linked, { recursive: true });
    await symlink(path.join(contentDir, 'skills', 'people-report', 'SKILL.md'), path.join(linked, 'SKILL.md'));

    expect(await isSkillDirectory(linked)).toBe(true);
  });

  it('rejects a plain file sitting directly under skills/', async () => {
    const skillsDir = path.join(contentDir, 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, 'notes.json'), '{}\n', 'utf8');

    expect(await isSkillDirectory(path.join(skillsDir, 'notes.json'))).toBe(false);
  });
});

describe(listSupportEntries, () => {
  let contentDir: string;

  beforeEach(async () => {
    contentDir = path.join(tmpdir(), `agents-test-support-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  it('lists everything under skills/ that is neither a skill, a reserved entry, nor a dotfile', async () => {
    const skillsDir = path.join(contentDir, 'skills');
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(skillsDir, '_data'), { recursive: true });
    await mkdir(path.join(skillsDir, '_partials'), { recursive: true });
    await mkdir(path.join(skillsDir, '_harnesses'), { recursive: true });
    await writeFile(path.join(skillsDir, 'notes.json'), '{}\n', 'utf8');
    await writeFile(path.join(skillsDir, '.DS_Store'), '', 'utf8');

    expect(await listSupportEntries(skillsDir)).toEqual(['_data', 'notes.json']);
  });

  // `_data` establishes that a `_` prefix marks support content rather than an exclusion, so `__tests__` needs one of
  // its own or it installs into every harness home alongside the reference files skills actually read.
  it('excludes a test directory, which shares the support-content prefix without shipping', async () => {
    const skillsDir = path.join(contentDir, 'skills');
    await writeSkill(contentDir, 'people-report');
    await mkdir(path.join(skillsDir, '_data'), { recursive: true });
    await mkdir(path.join(skillsDir, '__tests__'), { recursive: true });

    expect(await listSupportEntries(skillsDir)).toEqual(['_data']);
  });

  it('returns nothing for an absent skills directory', async () => {
    expect(await listSupportEntries(path.join(contentDir, 'skills'))).toEqual([]);
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

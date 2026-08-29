import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { InstallOptions } from '../../../lib/types.ts';
import { syncCommand } from '../sync.ts';

describe('syncCommand with a declared collection', () => {
  let projectRoot: string;
  let contentDir: string;
  // Targeting reads the home tier's declaration and detects installed harnesses under it, so every run below is
  // given a temp home rather than the developer's own.
  let homeDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    homeDir = path.join(tmpdir(), `agents-test-sync-coll-home-${stamp}`);
    projectRoot = path.join(tmpdir(), `agents-test-sync-coll-proj-${stamp}`);
    contentDir = path.join(tmpdir(), `agents-test-sync-coll-content-${stamp}`);
    await mkdir(homeDir, { recursive: true });
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(contentDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(homeDir, { recursive: true, force: true });
    await rm(contentDir, { recursive: true, force: true });
  });

  it('deploys the transitive members of a declared collection — a skill and a subagent', async () => {
    await writeOverlays(contentDir);
    await writeLibrarySkill(contentDir, 'people-report');
    await writeLibrarySubagent(contentDir, 'canary');
    await writeCollection(contentDir, 'recommended', { skills: ['people-report'], subagents: ['canary'] });
    await declareCollections(projectRoot, 'recommended');

    await syncCommand(makeOptions(), projectRoot, contentDir, homeDir);

    const skill = await readFile(path.join(projectRoot, '.claude', 'skills', 'people-report', 'SKILL.md'), 'utf8');
    expect(skill).toContain('<!-- codeassembly-skill:people-report -->');
    const subagent = await readFile(path.join(projectRoot, '.claude', 'agents', 'canary.md'), 'utf8');
    expect(subagent).toContain('<!-- codeassembly-subagent:canary -->');
  });

  it('throws when the collection references a missing artifact, writing nothing', async () => {
    await writeCollection(contentDir, 'recommended', { skills: ['ghost'] });
    await declareCollections(projectRoot, 'recommended');

    await expect(syncCommand(makeOptions(), projectRoot, contentDir, homeDir)).rejects.toThrow(/ghost.*not found/);
    expect(existsSync(path.join(projectRoot, '.claude'))).toBe(false);
  });
});

/** Build sync options targeting only the Claude harness. */
function makeOptions(): InstallOptions {
  return { harness: 'claude', link: false, force: false, dryRun: false };
}

/** Declares the given collection slugs in the project-scope codeassembly.yaml. */
async function declareCollections(projectRoot: string, ...slugs: ReadonlyArray<string>): Promise<void> {
  const useBlock = `  use:\n${slugs.map((slug) => `    - ${slug}`).join('\n')}\n`;
  await writeFile(path.join(projectRoot, '.agents', 'codeassembly.yaml'), `collections:\n${useBlock}`, 'utf8');
}

/** Writes a members-based collection `<slug>.md` into the temp content library. */
async function writeCollection(
  contentDir: string,
  slug: string,
  members: { skills?: ReadonlyArray<string>; subagents?: ReadonlyArray<string> },
): Promise<void> {
  const dir = path.join(contentDir, 'collections');
  await mkdir(dir, { recursive: true });
  const blocks = Object.entries(members).map(
    ([key, slugs]) => `  ${key}:\n${slugs.map((member) => `    - ${member}`).join('\n')}`,
  );
  const frontmatter = `name: ${slug}\nmembers:\n${blocks.join('\n')}\n`;
  await writeFile(path.join(dir, `${slug}.md`), `---\n${frontmatter}---\n\n# ${slug}\n`, 'utf8');
}

/** Writes a fixture skill into the temp content library's `skills/<slug>/SKILL.md`. */
async function writeLibrarySkill(contentDir: string, slug: string): Promise<void> {
  const dir = path.join(contentDir, 'skills', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${slug}\n---\n\n# ${slug}\n`, 'utf8');
}

/** Writes a fixture subagent `<slug>.md` into the temp content library's `subagents/`. */
async function writeLibrarySubagent(contentDir: string, slug: string): Promise<void> {
  const dir = path.join(contentDir, 'subagents');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${slug}.md`), `---\nname: ${slug}\n---\n\n# ${slug}\n\nUse {tool:Read}.\n`, 'utf8');
}

/** Writes the Claude harness overlay supplying the `_defaults` the subagent frontmatter merge applies. */
async function writeOverlays(contentDir: string): Promise<void> {
  const dataDir = path.join(contentDir, 'subagents', '_data');
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, 'claude.yaml'), '_defaults:\n  permissionMode: bypassPermissions\n', 'utf8');
}

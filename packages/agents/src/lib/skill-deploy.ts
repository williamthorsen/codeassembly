import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { makeArtifactMarker } from './artifact-marker.ts';
import { readDeploy } from './deploy-frontmatter.ts';
import { writeIfChanged } from './fs-helpers.ts';
import { renderSkillDirectory, type SkillDeployContext } from './skill-transform.ts';
import { isEnoent, isMissingFile } from './type-guards.ts';

const skillMarker = makeArtifactMarker('skill');

/** A declared skill resolved against the library: its stable slug and the directory to copy from. */
export interface ResolvedSkill {
  readonly slug: string;
  readonly srcDir: string;
}

/**
 * Resolves a declared skill slug against the library, confirming its `SKILL.md` exists and that the skill opts into
 * declared delivery. A missing directory throws a clear error naming the slug.
 * A skill still on the `install` path is rejected rather than deployed, since declaring an `install` skill would ship
 * it twice: once via `install`, once via `sync`.
 *
 * @param librarySkillsDir The library `content/skills` directory the slug is resolved under.
 */
export async function resolveDeclaredSkill(slug: string, librarySkillsDir: string): Promise<ResolvedSkill> {
  const srcDir = path.join(librarySkillsDir, slug);
  let skillMd: string;
  try {
    skillMd = await readFile(path.join(srcDir, 'SKILL.md'), 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Declared skill "${slug}" was not found in the library at ${srcDir}`);
    }
    throw error;
  }

  const deploy = readDeploy(skillMd, `skills/${slug}/SKILL.md`);
  if (deploy !== 'declared') {
    throw new Error(
      `Declared skill "${slug}" is not marked for declared delivery; its SKILL.md has deploy: ${deploy}. ` +
        'Add `deploy: declared` to its frontmatter, or remove it from the declaration.',
    );
  }

  return { slug, srcDir };
}

/**
 * Materializes a resolved skill into `destDir/` for one harness: every `.md` file is include-expanded and
 * tool-name/link/template-rewritten through the shared skill transform, non-`.md` files are mirrored verbatim, and the
 * declared-skill ownership marker is stamped into the deployed root `SKILL.md`.
 * The write is byte-stable: unchanged files are left untouched, and destination files the source no longer carries —
 * along with any directory left empty by their removal — are pruned, so re-deploying an unchanged skill makes no
 * filesystem change.
 */
export async function deploySkill(skill: ResolvedSkill, destDir: string, context: SkillDeployContext): Promise<void> {
  const entries = await renderSkillDirectory(skill.srcDir, skill.slug, context);
  await mkdir(destDir, { recursive: true });

  const expectedFiles = new Set(entries.map((entry) => entry.relPath));
  await pruneOrphans(destDir, '', expectedFiles);

  for (const entry of entries) {
    const destPath = path.join(destDir, entry.relPath);
    await mkdir(path.dirname(destPath), { recursive: true });
    if (entry.kind === 'markdown') {
      const body = entry.relPath === 'SKILL.md' ? skillMarker.injectMarker(entry.content, skill.slug) : entry.content;
      await writeIfChanged(destPath, body);
    } else {
      await copyFileIfChanged(entry.srcPath, destPath);
    }
  }
}

// region | Helpers

/** Copies `srcPath` to `destPath` only when the bytes differ, so that unchanged files are left untouched. */
async function copyFileIfChanged(srcPath: string, destPath: string): Promise<void> {
  const desired = await readFile(srcPath);
  const current = await readFileOrUndefined(destPath);
  if (current?.equals(desired)) {
    return;
  }
  await writeFile(destPath, desired);
}

/**
 * Removes every destination file absent from `expectedFiles`, then any directory left empty by those removals, so a
 * skill's dropped files — and the directories that held them — do not linger across re-deploys.
 */
async function pruneOrphans(destDir: string, relDir: string, expectedFiles: ReadonlySet<string>): Promise<void> {
  for (const entry of await readdir(path.join(destDir, relDir), { withFileTypes: true })) {
    const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    const absPath = path.join(destDir, rel);
    if (entry.isDirectory()) {
      await pruneOrphans(destDir, rel, expectedFiles);
      if ((await readdir(absPath)).length === 0) {
        await rm(absPath, { recursive: true, force: true });
      }
    } else if (!expectedFiles.has(rel)) {
      await rm(absPath, { force: true });
    }
  }
}

/** Reads a file as a buffer, returning `undefined` when it does not exist. */
async function readFileOrUndefined(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return;
    }
    throw error;
  }
}

// endregion | Helpers

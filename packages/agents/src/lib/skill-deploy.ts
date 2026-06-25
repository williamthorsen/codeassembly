import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeIfChanged } from './fs-helpers.ts';
import { readSkillDeploy } from './skill-frontmatter.ts';
import { injectSkillMarker } from './skill-marker.ts';
import { isEnoent, isMissingFile } from './type-guards.ts';

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

  const deploy = readSkillDeploy(skillMd, `skills/${slug}/SKILL.md`);
  if (deploy !== 'declared') {
    throw new Error(
      `Declared skill "${slug}" is not marked for declared delivery; its SKILL.md has deploy: ${deploy}. ` +
        'Add `deploy: declared` to its frontmatter, or remove it from the declaration.',
    );
  }

  return { slug, srcDir };
}

/**
 * Materializes a resolved skill into `destDir/`, mirroring its library directory verbatim and stamping the
 * declared-skill ownership marker into the deployed root `SKILL.md`.
 * The mirror is byte-stable: Unchanged files are left untouched and destination files the source no longer carries
 * are removed) — so re-running sync on an unchanged skill makes no filesystem changes.
 * Verbatim only: no include expansion or path rewriting (deferred to the first skill that needs it).
 */
export async function deploySkill(skill: ResolvedSkill, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const srcEntries = await readdir(skill.srcDir, { withFileTypes: true });
  await removeOrphans(destDir, srcEntries);

  for (const entry of srcEntries) {
    const srcPath = path.join(skill.srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copySubtree(srcPath, destPath);
    } else if (entry.name === 'SKILL.md') {
      await writeIfChanged(destPath, injectSkillMarker(await readFile(srcPath, 'utf8'), skill.slug));
    } else {
      await copyFileIfChanged(srcPath, destPath);
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
 * Byte-stably mirrors an auxiliary subdirectory (no marker injection), removing destination entries
 * that the source dropped. */
async function copySubtree(srcDir: string, destDir: string): Promise<void> {
  await mkdir(destDir, { recursive: true });
  const srcEntries = await readdir(srcDir, { withFileTypes: true });
  await removeOrphans(destDir, srcEntries);

  for (const entry of srcEntries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    await (entry.isDirectory() ? copySubtree(srcPath, destPath) : copyFileIfChanged(srcPath, destPath));
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

/** Removes every entry under `destDir` whose name is absent from `srcEntries`, so source deletions do not linger. */
async function removeOrphans(destDir: string, srcEntries: ReadonlyArray<{ name: string }>): Promise<void> {
  const srcNames = new Set(srcEntries.map((entry) => entry.name));
  for (const destEntry of await readdir(destDir, { withFileTypes: true })) {
    if (!srcNames.has(destEntry.name)) {
      await rm(path.join(destDir, destEntry.name), { recursive: true, force: true });
    }
  }
}

// endregion | Helpers

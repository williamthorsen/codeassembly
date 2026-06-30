import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { makeArtifactMarker } from './artifact-marker.ts';
import { parseFrontmatter } from './frontmatter-merger.ts';
import { writeIfChanged } from './fs-helpers.ts';
import { ALL_HARNESS_IDS, isHarnessId } from './harness.ts';
import { renderSkillDirectory, type SkillDeployContext } from './skill-transform.ts';
import { isEnoent, isMissingFile, isRecord } from './type-guards.ts';
import type { HarnessId } from './types.ts';

const skillMarker = makeArtifactMarker('skill');

/**
 * A declared skill resolved against the library: its stable slug, the directory to copy from, and the harnesses it
 * targets. `targetHarnesses` is absent when the skill carries no `harnesses:` field, meaning it deploys to all harnesses.
 */
export interface ResolvedSkill {
  readonly slug: string;
  readonly srcDir: string;
  readonly targetHarnesses?: ReadonlyArray<HarnessId>;
}

/**
 * Resolves a declared skill slug against the library, confirming its `SKILL.md` exists and reading the harnesses it
 * targets from frontmatter. A missing directory or `SKILL.md` throws a clear error naming the slug; an unknown harness
 * id in the `harnesses:` field throws naming the slug and the offending id.
 *
 * @param librarySkillsDir The library `content/skills` directory the slug is resolved under.
 */
export async function resolveDeclaredSkill(slug: string, librarySkillsDir: string): Promise<ResolvedSkill> {
  const srcDir = path.join(librarySkillsDir, slug);
  let content: string;
  try {
    content = await readFile(path.join(srcDir, 'SKILL.md'), 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      throw new Error(`Declared skill "${slug}" was not found in the library at ${srcDir}`);
    }
    throw error;
  }

  const targetHarnesses = readTargetHarnesses(content, slug);
  return targetHarnesses === undefined ? { slug, srcDir } : { slug, srcDir, targetHarnesses };
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
      // Strip the build-only `harnesses:` directive from the deployed root SKILL.md — it steers deployment, not the
      // harness, which would otherwise carry a frontmatter key it ignores.
      const body =
        entry.relPath === 'SKILL.md'
          ? skillMarker.injectMarker(stripHarnessesDirective(entry.content), skill.slug)
          : entry.content;
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

/**
 * Reads a skill's `harnesses:` frontmatter field, normalizing a string or list into a harness-id array. Returns
 * `undefined` when the field is absent or empty, meaning the skill targets all harnesses. Throws when a listed value
 * is not a known harness id, naming the slug and the offending value.
 */
function readTargetHarnesses(skillContent: string, slug: string): ReadonlyArray<HarnessId> | undefined {
  const { lines } = parseFrontmatter(skillContent);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed) || parsed.harnesses === undefined || parsed.harnesses === null) {
    return undefined;
  }

  const values = Array.isArray(parsed.harnesses) ? parsed.harnesses : [parsed.harnesses];
  if (values.length === 0) {
    return undefined;
  }

  const harnesses: Array<HarnessId> = [];
  for (const value of values) {
    if (typeof value !== 'string' || !isHarnessId(value)) {
      throw new Error(
        `Skill "${slug}" declares an unknown harness "${String(value)}" in its \`harnesses:\` field; ` +
          `known harnesses are ${ALL_HARNESS_IDS.join(', ')}.`,
      );
    }
    harnesses.push(value);
  }
  return harnesses;
}

/**
 * Removes the `harnesses:` build directive from a skill's frontmatter, dropping the key line and any indented
 * block-continuation beneath it. Returns the content unchanged when no `harnesses:` key is present, so a skill that
 * never declared one is left byte-identical.
 */
function stripHarnessesDirective(content: string): string {
  const { lines, body } = parseFrontmatter(content);
  if (!lines.some((line) => /^harnesses\s*:/.test(line))) {
    return content;
  }

  const kept: Array<string> = [];
  let skippingBlock = false;
  for (const line of lines) {
    if (skippingBlock) {
      if (/^\s/.test(line) && line.trim() !== '') {
        continue;
      }
      skippingBlock = false;
    }
    if (/^harnesses\s*:/.test(line)) {
      skippingBlock = true;
      continue;
    }
    kept.push(line);
  }
  return `---\n${kept.join('\n')}\n---\n${body}`;
}

// endregion | Helpers

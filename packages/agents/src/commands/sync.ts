import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { resolveContentDir } from '../lib/content-resolver.ts';
import { resolvePlatformIds, resolvePlatformPaths } from '../lib/platform.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { extractRulebookSkillSlug, renderSkillFile } from '../lib/rulebook-skill.ts';
import { readRulebooksManifest } from '../lib/rulebooks-manifest.ts';
import { extractInstalledSlugs, injectRulebook, removeRulebook } from '../lib/sentinel-inliner.ts';
import { isEnoent, isMissingFile } from '../lib/type-guards.ts';
import type { InstallOptions } from '../lib/types.ts';

/** A declared rulebook resolved against the library: its neutral body and which delivery modes it requests. */
interface ResolvedRulebook {
  readonly slug: string;
  readonly body: string;
  readonly ambient: boolean;
  readonly skill: boolean;
  readonly description: string | undefined;
}

/**
 * Resolves the project-scope `.agents/rulebooks.yaml`, materializes each declared rulebook's neutral body to
 * `.agents/rulebooks/<slug>.md`, inlines `ambient` rulebooks into `.agents/PROJECT.md`, writes `skill` rulebooks
 * as thin-wrapper skills into each targeted platform's project-local skills dir, and retracts anything no longer
 * declared. Installed state is derived from the filesystem, not a manifest, which keeps the command idempotent.
 * An absent `rulebooks.yaml` is a total no-op.
 *
 * @param projectRoot The project whose `.agents/` directory is synced (defaults to the current directory).
 * @param contentDirOverride Override for the rulebook library source (defaults to the package content dir).
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  contentDirOverride?: string,
): Promise<void> {
  const declared = await readRulebooksManifest(projectRoot);
  if (declared === undefined) {
    console.info('No .agents/rulebooks.yaml found. Nothing to sync.');
    return;
  }

  const librarySrcDir = path.join(contentDirOverride ?? resolveContentDir(), 'guidance', 'rulebooks');
  const neutralDir = path.join(projectRoot, '.agents', 'rulebooks');
  const projectMdPath = path.join(projectRoot, '.agents', 'PROJECT.md');

  // Resolve and validate every declared rulebook before writing anything, so a missing library file or invalid
  // frontmatter fails the whole run rather than leaving a partial sync behind.
  const resolved = await Promise.all(declared.map((slug) => resolveRulebook(slug, librarySrcDir)));

  // Reconcile two surfaces against the filesystem independently. Neutral files track the declared set;
  // PROJECT.md tracks the desired *ambient* set. Keying PROJECT.md on declaration alone would strand a block
  // whose rulebook is still declared but whose delivery no longer includes `ambient`.
  const declaredSet = new Set(declared);
  const desiredAmbient = new Set(resolved.filter((rulebook) => rulebook.ambient).map((rulebook) => rulebook.slug));
  const desiredSkill = new Set(resolved.filter((rulebook) => rulebook.skill).map((rulebook) => rulebook.slug));

  // Skill delivery targets project-local platform skills dirs, gated by detection (or `--platform`). Passing
  // `projectRoot` as the base is what keeps the skills project-scoped, and keeps tests out of the real home dir.
  const platformSkillDirs = resolvePlatformIds(options.platform, projectRoot).map(
    (platformId) => resolvePlatformPaths(platformId, projectRoot).skillsDir,
  );

  const existingProjectMd = await readFileOrEmpty(projectMdPath);
  const neutralOrphans = (await listNeutralSlugs(neutralDir)).filter((slug) => !declaredSet.has(slug));
  const inlineOrphans = extractInstalledSlugs(existingProjectMd).filter((slug) => !desiredAmbient.has(slug));
  // A skill dir is sync-owned only when its `SKILL.md` carries the provenance marker; that gate is what keeps
  // hand-authored skills safe. Orphans are owned dirs whose slug is no longer delivered as a skill.
  const skillOrphansByDir = await Promise.all(
    platformSkillDirs.map(async (skillsDir) => ({
      skillsDir,
      orphans: (await listOwnedSkillSlugs(skillsDir)).filter((slug) => !desiredSkill.has(slug)),
    })),
  );

  if (options.dryRun) {
    reportDryRun(resolved, [...new Set([...neutralOrphans, ...inlineOrphans])], platformSkillDirs, skillOrphansByDir);
    return;
  }

  if (resolved.length > 0) {
    await mkdir(neutralDir, { recursive: true });
  }

  // PROJECT.md is read once, mutated in memory across all inject/remove operations, and written once.
  let projectMd = existingProjectMd;
  for (const rulebook of resolved) {
    await writeIfChanged(path.join(neutralDir, `${rulebook.slug}.md`), rulebook.body);
    if (rulebook.ambient) {
      projectMd = injectRulebook(projectMd, rulebook.slug, rulebook.body);
    }
  }
  for (const slug of inlineOrphans) {
    projectMd = removeRulebook(projectMd, slug);
  }

  // `.agents/rulebooks/` is sync-owned, so deleting an undeclared neutral file here is safe, not user data loss.
  for (const slug of neutralOrphans) {
    await rm(path.join(neutralDir, `${slug}.md`), { force: true });
  }

  if (projectMd !== existingProjectMd) {
    await mkdir(path.dirname(projectMdPath), { recursive: true });
    await writeFile(projectMdPath, projectMd, 'utf8');
  }

  // Reconcile skill files per targeted platform: write every skill-delivery rulebook, then retract sync-owned
  // skill dirs that are no longer skill rulebooks. Orphans were computed against the pre-write filesystem.
  for (const { skillsDir, orphans } of skillOrphansByDir) {
    for (const rulebook of resolved) {
      if (!rulebook.skill) {
        continue;
      }
      const skillDir = path.join(skillsDir, rulebook.slug);
      await mkdir(skillDir, { recursive: true });
      await writeIfChanged(
        path.join(skillDir, 'SKILL.md'),
        renderSkillFile(rulebook.slug, rulebook.description, rulebook.body),
      );
    }
    for (const slug of orphans) {
      await rm(path.join(skillsDir, slug), { recursive: true, force: true });
    }
  }

  const skillRetractions = skillOrphansByDir.reduce((total, platform) => total + platform.orphans.length, 0);
  const skillFilesWritten = desiredSkill.size * platformSkillDirs.length;
  console.info(
    `Synced ${resolved.length} rulebook(s); delivered ${skillFilesWritten} skill file(s) across ` +
      `${platformSkillDirs.length} platform(s); retracted ${neutralOrphans.length} neutral file(s) and ` +
      `${skillRetractions} skill dir(s).`,
  );
}

// region | Helpers

/** Lists the slugs of materialized neutral files, returning an empty list when the directory is absent. */
async function listNeutralSlugs(neutralDir: string): Promise<ReadonlyArray<string>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(neutralDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.slice(0, -'.md'.length));
}

/**
 * Lists the names of skill directories under `skillsDir` that sync owns — those whose `SKILL.md` carries the
 * rulebook provenance marker. Returns an empty list when the directory is absent. Entries without a readable
 * `SKILL.md` (a marker-less hand-authored skill, a stray `.DS_Store`) are skipped, never claimed for deletion.
 */
async function listOwnedSkillSlugs(skillsDir: string): Promise<ReadonlyArray<string>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<string> = [];
  for (const entry of entries) {
    let content: string;
    try {
      content = await readFile(path.join(skillsDir, entry, 'SKILL.md'), 'utf8');
    } catch (error: unknown) {
      // Not a skill dir: the SKILL.md is absent, or the entry is a regular file (ENOTDIR on read-through).
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    if (extractRulebookSkillSlug(content) !== undefined) {
      owned.push(entry);
    }
  }
  return owned;
}

/** Reads a file, returning an empty string when it does not exist. */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

/** Prints the writes and retractions a real run would perform. */
function reportDryRun(
  resolved: ReadonlyArray<ResolvedRulebook>,
  retracted: ReadonlyArray<string>,
  platformSkillDirs: ReadonlyArray<string>,
  skillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>,
): void {
  console.info('[dry-run] sync would:');
  for (const rulebook of resolved) {
    const inline = rulebook.ambient ? ' (+ inline into PROJECT.md)' : '';
    console.info(`  write .agents/rulebooks/${rulebook.slug}.md${inline}`);
    if (rulebook.skill) {
      for (const skillsDir of platformSkillDirs) {
        console.info(`  write ${path.join(skillsDir, rulebook.slug, 'SKILL.md')}`);
      }
    }
  }
  for (const slug of retracted) {
    console.info(`  retract ${slug} (no longer declared, or no longer ambient)`);
  }
  for (const { skillsDir, orphans } of skillOrphansByDir) {
    for (const slug of orphans) {
      console.info(`  retract skill ${path.join(skillsDir, slug)} (no longer a skill rulebook)`);
    }
  }
}

/** Reads a rulebook from the library, validates its frontmatter, and returns its neutral body and delivery. */
async function resolveRulebook(slug: string, librarySrcDir: string): Promise<ResolvedRulebook> {
  const srcPath = path.join(librarySrcDir, `${slug}.md`);
  let content: string;
  try {
    content = await readFile(srcPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      throw new Error(`Declared rulebook "${slug}" was not found in the library at ${srcPath}`);
    }
    throw error;
  }

  const { rulebook, body } = parseRulebookFile(content, `${slug}.md`);
  return {
    slug,
    body: `${body.trim()}\n`,
    ambient: rulebook.delivery.includes('ambient'),
    skill: rulebook.delivery.includes('skill'),
    description: rulebook.description,
  };
}

/** Writes `content` to `filePath` only when it differs from the current contents, keeping re-runs diff-free. */
async function writeIfChanged(filePath: string, content: string): Promise<void> {
  if ((await readFileOrEmpty(filePath)) === content) {
    return;
  }
  await writeFile(filePath, content, 'utf8');
}

// endregion | Helpers

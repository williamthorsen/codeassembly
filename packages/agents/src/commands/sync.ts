import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { readFileOrEmpty, writeIfChanged } from '../lib/fs-helpers.ts';
import { resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { extractRulebookSkillSlug, renderSkillFile, resolveSkillName } from '../lib/rulebook-skill.ts';
import { extractInstalledSlugs, injectRulebook, removeRulebook } from '../lib/sentinel-inliner.ts';
import { deploySkill, resolveDeclaredSkill, type ResolvedSkill } from '../lib/skill-deploy.ts';
import { extractDeployedSkillSlug } from '../lib/skill-marker.ts';
import { isEnoent, isMissingFile } from '../lib/type-guards.ts';
import type { InstallOptions } from '../lib/types.ts';

/** A declared rulebook resolved against the library: its neutral body and which delivery modes it requests. */
interface ResolvedRulebook {
  readonly slug: string;
  readonly skillName: string;
  readonly body: string;
  readonly ambient: boolean;
  readonly skill: boolean;
  readonly description: string | undefined;
}

/**
 * Resolves the project's `codeassembly.yaml` scope chain, materializes each declared rulebook's neutral body to
 * `.agents/rulebooks/<slug>.md`, inlines `ambient` rulebooks into `.agents/PROJECT.md`, writes `skill` rulebooks
 * as thin-wrapper skills into each targeted harness's project-local skills dir, and retracts anything no longer
 * declared. Installed state is derived from the filesystem, not a manifest, which keeps the command idempotent.
 * An absent `codeassembly.yaml` is a total no-op.
 *
 * @param projectRoot The project whose `.agents/` directory is synced (defaults to the current directory).
 * @param contentDirOverride Override for the rulebook library source (defaults to the package content dir).
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  contentDirOverride?: string,
): Promise<void> {
  const declaration = await resolveDeclaration({ cwd: projectRoot });
  if (declaration === undefined) {
    console.info('No .agents/codeassembly.yaml found. Nothing to sync.');
    return;
  }
  const declaredRulebooks = declaration.rulebooks;

  const contentDir = contentDirOverride ?? resolveContentDir();
  const librarySrcDir = path.join(contentDir, 'guidance', 'rulebooks');
  const librarySkillsDir = path.join(contentDir, 'skills');
  const neutralDir = path.join(projectRoot, '.agents', 'rulebooks');
  const projectMdPath = path.join(projectRoot, '.agents', 'PROJECT.md');

  // Resolve and validate every declared rulebook and skill before writing anything, so a missing library file,
  // invalid frontmatter, or a still-`install` skill fails the whole run rather than leaving a partial sync behind.
  const resolved = await Promise.all(declaredRulebooks.map((slug) => resolveRulebook(slug, librarySrcDir)));
  assertNoSkillNameCollisions(resolved);
  const resolvedSkills = await Promise.all(
    declaration.skills.map((slug) => resolveDeclaredSkill(slug, librarySkillsDir)),
  );

  // Reconcile two surfaces against the filesystem independently. Neutral files track the declared set;
  // PROJECT.md tracks the desired *ambient* set. Keying PROJECT.md on declaration alone would strand a block
  // whose rulebook is still declared but whose delivery no longer includes `ambient`.
  const declaredSet = new Set(declaredRulebooks);
  const desiredAmbient = new Set(resolved.filter((rulebook) => rulebook.ambient).map((rulebook) => rulebook.slug));
  // Maps each skill-delivery rulebook's stable slug to the directory its skill currently belongs in. Retraction
  // compares this against what each owned directory's marker reports, so a renamed skill retracts its old dir.
  const desiredSkillDirs = new Map(
    resolved.filter((rulebook) => rulebook.skill).map((rulebook) => [rulebook.slug, rulebook.skillName] as const),
  );
  const declaredSkillSet = new Set(resolvedSkills.map((skill) => skill.slug));

  // Rulebook skills and declared skills share the project-local skills dirs. A directory name claimed by both
  // delivery namespaces would clobber, so reject the overlap before any write.
  assertNoCrossNamespaceCollisions([...desiredSkillDirs.values()], declaredSkillSet);

  // Skill delivery targets project-local harness skills dirs, gated by detection (or `--harness`). Passing
  // `projectRoot` as the base is what keeps the skills project-scoped, and keeps tests out of the real home dir.
  const harnessSkillDirs = resolveHarnessIds(options.harness, projectRoot).map(
    (harnessId) => resolveHarnessPaths(harnessId, projectRoot).skillsDir,
  );

  const existingProjectMd = await readFileOrEmpty(projectMdPath);
  const neutralOrphans = (await listNeutralSlugs(neutralDir)).filter((slug) => !declaredSet.has(slug));
  const inlineOrphans = extractInstalledSlugs(existingProjectMd).filter((slug) => !desiredAmbient.has(slug));
  // A skill dir is sync-owned only when its `SKILL.md` carries the provenance marker; that gate is what keeps
  // hand-authored skills safe. An owned dir is an orphan when its marker slug no longer maps to that directory —
  // because the rulebook is no longer skill-delivered, or because its resolved skill name (and dir) changed.
  const skillOrphansByDir = await Promise.all(
    harnessSkillDirs.map(async (skillsDir) => ({
      skillsDir,
      orphans: (await listOwnedSkills(skillsDir))
        .filter(({ dir, slug }) => desiredSkillDirs.get(slug) !== dir)
        .map(({ dir }) => dir),
    })),
  );
  // Declared-skill orphans reconcile independently against the same dirs, reading only the declared-skill marker so
  // the two namespaces never consider each other's dirs. An owned declared-skill dir is an orphan once its slug is
  // no longer declared.
  const declaredSkillOrphansByDir = await Promise.all(
    harnessSkillDirs.map(async (skillsDir) => ({
      skillsDir,
      orphans: (await listOwnedDeclaredSkills(skillsDir))
        .filter(({ slug }) => !declaredSkillSet.has(slug))
        .map(({ dir }) => dir),
    })),
  );

  if (options.dryRun) {
    reportDryRun(
      resolved,
      [...new Set([...neutralOrphans, ...inlineOrphans])],
      harnessSkillDirs,
      skillOrphansByDir,
      resolvedSkills,
      declaredSkillOrphansByDir,
    );
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

  // Reconcile skill files per targeted harness: Retract sync-owned skill dirs that are no longer current, then
  // write every skill-delivery rulebook. Orphans were computed against the pre-write filesystem, so retracting
  // before writing lets a skill name freed by one rulebook be recreated for another in the same sync, instead
  // of the write being clobbered by a later retract.
  for (const { skillsDir, orphans } of skillOrphansByDir) {
    for (const dir of orphans) {
      await rm(path.join(skillsDir, dir), { recursive: true, force: true });
    }
    for (const rulebook of resolved) {
      if (!rulebook.skill) {
        continue;
      }
      const skillDir = path.join(skillsDir, rulebook.skillName);
      await mkdir(skillDir, { recursive: true });
      await writeIfChanged(
        path.join(skillDir, 'SKILL.md'),
        renderSkillFile(rulebook.skillName, rulebook.slug, rulebook.description, rulebook.body),
      );
    }
  }

  // Reconcile declared skills per targeted harness, independently of the rulebook-skill pass above: retract owned
  // declared-skill dirs no longer declared, then deploy each declared skill into `<skillsDir>/<slug>/`.
  for (const { skillsDir, orphans } of declaredSkillOrphansByDir) {
    for (const dir of orphans) {
      await rm(path.join(skillsDir, dir), { recursive: true, force: true });
    }
    for (const skill of resolvedSkills) {
      await deploySkill(skill, path.join(skillsDir, skill.slug));
    }
  }

  const skillRetractions = skillOrphansByDir.reduce((total, harness) => total + harness.orphans.length, 0);
  const skillFilesWritten = desiredSkillDirs.size * harnessSkillDirs.length;
  const declaredSkillRetractions = declaredSkillOrphansByDir.reduce(
    (total, harness) => total + harness.orphans.length,
    0,
  );
  const declaredSkillsDeployed = resolvedSkills.length * harnessSkillDirs.length;
  console.info(
    `Synced ${resolved.length} rulebook(s) and ${resolvedSkills.length} declared skill(s); delivered ` +
      `${skillFilesWritten} rulebook-skill file(s) and ${declaredSkillsDeployed} declared-skill dir(s) across ` +
      `${harnessSkillDirs.length} harness(s); retracted ${neutralOrphans.length} neutral file(s), ` +
      `${skillRetractions} rulebook-skill dir(s), and ${declaredSkillRetractions} declared-skill dir(s).`,
  );
}

// region | Helpers

/**
 * Throws when a rulebook-skill directory name and a declared-skill directory name collide, which would let the two
 * delivery namespaces clobber each other in a shared project-local skills dir. Failing here, before any write,
 * forces the conflict to be resolved by renaming one side rather than letting the last write win.
 */
function assertNoCrossNamespaceCollisions(
  rulebookSkillDirs: ReadonlyArray<string>,
  declaredSkillSlugs: Set<string>,
): void {
  const collisions = [...new Set(rulebookSkillDirs)].filter((dir) => declaredSkillSlugs.has(dir));
  if (collisions.length > 0) {
    throw new Error(
      `Skill directory name collision across delivery namespaces: ${collisions.join(', ')} ` +
        'is delivered as both a rulebook skill and a declared skill. Rename one so they no longer share a directory.',
    );
  }
}

/**
 * Throws when two skill-delivery rulebooks resolve to the same skill name, which would share one directory and
 * clobber each other. Failing here, before any write, forces the conflict to be resolved with a `skill-name`
 * override rather than silently letting the last write win.
 */
function assertNoSkillNameCollisions(resolved: ReadonlyArray<ResolvedRulebook>): void {
  const slugsByName = new Map<string, Array<string>>();
  for (const rulebook of resolved) {
    if (!rulebook.skill) {
      continue;
    }
    const slugs = slugsByName.get(rulebook.skillName) ?? [];
    slugs.push(rulebook.slug);
    slugsByName.set(rulebook.skillName, slugs);
  }

  for (const [skillName, slugs] of slugsByName) {
    if (slugs.length > 1) {
      throw new Error(
        `Skill name collision: rulebooks ${slugs.join(', ')} all resolve to skill "${skillName}". ` +
          'Give all but one a distinct `skill-name`.',
      );
    }
  }
}

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
 * Lists the declared skills sync owns under `skillsDir` as `{ dir, slug }` pairs — those whose `SKILL.md` carries the
 * declared-skill marker, paired with the slug recovered from it. Reads only the declared-skill marker, so it never
 * claims a rulebook-skill dir or a hand-authored skill. Returns an empty list when the directory is absent; entries
 * without a readable `SKILL.md` are skipped.
 */
async function listOwnedDeclaredSkills(skillsDir: string): Promise<ReadonlyArray<{ dir: string; slug: string }>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ dir: string; slug: string }> = [];
  for (const entry of entries) {
    let content: string;
    try {
      content = await readFile(path.join(skillsDir, entry, 'SKILL.md'), 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    const slug = extractDeployedSkillSlug(content);
    if (slug !== undefined) {
      owned.push({ dir: entry, slug });
    }
  }
  return owned;
}

/**
 * Lists the sync-owned skills under `skillsDir` as `{ dir, slug }` pairs — those whose `SKILL.md` carries the
 * rulebook provenance marker, paired with the slug recovered from it. The directory locates the skill on disk;
 * the slug is its stable identity, which the directory may no longer match. Returns an empty list when the
 * directory is absent. Entries without a readable `SKILL.md` (a marker-less hand-authored skill, a stray
 * `.DS_Store`) are skipped, never claimed for deletion.
 */
async function listOwnedSkills(skillsDir: string): Promise<ReadonlyArray<{ dir: string; slug: string }>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ dir: string; slug: string }> = [];
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
    const slug = extractRulebookSkillSlug(content);
    if (slug !== undefined) {
      owned.push({ dir: entry, slug });
    }
  }
  return owned;
}

/** Prints the writes and retractions a real run would perform. */
function reportDryRun(
  resolved: ReadonlyArray<ResolvedRulebook>,
  retracted: ReadonlyArray<string>,
  harnessSkillDirs: ReadonlyArray<string>,
  skillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  declaredSkillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>,
): void {
  console.info('[dry-run] sync would:');
  for (const rulebook of resolved) {
    const inline = rulebook.ambient ? ' (+ inline into PROJECT.md)' : '';
    console.info(`  write .agents/rulebooks/${rulebook.slug}.md${inline}`);
    if (rulebook.skill) {
      for (const skillsDir of harnessSkillDirs) {
        console.info(`  write ${path.join(skillsDir, rulebook.skillName, 'SKILL.md')}`);
      }
    }
  }
  for (const skill of resolvedSkills) {
    for (const skillsDir of harnessSkillDirs) {
      console.info(`  deploy declared skill ${path.join(skillsDir, skill.slug)}`);
    }
  }
  for (const slug of retracted) {
    console.info(`  retract ${slug} (no longer declared, or no longer ambient)`);
  }
  for (const { skillsDir, orphans } of skillOrphansByDir) {
    for (const dir of orphans) {
      console.info(`  retract skill ${path.join(skillsDir, dir)} (no longer the current skill dir)`);
    }
  }
  for (const { skillsDir, orphans } of declaredSkillOrphansByDir) {
    for (const dir of orphans) {
      console.info(`  retract declared skill ${path.join(skillsDir, dir)} (no longer declared)`);
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
    skillName: resolveSkillName(slug, rulebook['skill-name']),
    body: `${body.trim()}\n`,
    ambient: rulebook.delivery.includes('ambient'),
    skill: rulebook.delivery.includes('skill'),
    description: rulebook.description,
  };
}

// endregion | Helpers

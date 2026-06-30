import { type Dirent, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { makeArtifactMarker } from '../lib/artifact-marker.ts';
import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { resolveClosure } from '../lib/dependency-resolver.ts';
import { readFileOrEmpty, writeIfChanged } from '../lib/fs-helpers.ts';
import { HARNESSES, resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { loadHarnessOverlay } from '../lib/harness-overlay.ts';
import { collectPromptEntries, renderPromptEntries } from '../lib/prompts-yml.ts';
import { hasPromptsRegion, injectPromptsRegion, removePromptsRegion } from '../lib/prompts-yml-region.ts';
import { parseRulebookFile } from '../lib/rulebook-schema.ts';
import { extractRulebookSkillSlug, renderSkillFile, resolveSkillName } from '../lib/rulebook-skill.ts';
import { extractInstalledSlugs, injectRulebook, removeRulebook } from '../lib/sentinel-inliner.ts';
import { deploySkill, resolveDeclaredSkill, type ResolvedSkill } from '../lib/skill-deploy.ts';
import { renderSkillDirectory, type SkillDeployContext } from '../lib/skill-transform.ts';
import {
  deploySubagent,
  resolveDeclaredSubagent,
  type ResolvedSubagent,
  type SubagentDeployContext,
} from '../lib/subagent-deploy.ts';
import { loadToolMapping } from '../lib/tool-name-rewriter.ts';
import { isEnoent, isMissingFile } from '../lib/type-guards.ts';
import type { HarnessId, InstallOptions } from '../lib/types.ts';

const skillMarker = makeArtifactMarker('skill');
const subagentMarker = makeArtifactMarker('subagent');

/** A declared rulebook resolved against the library: its neutral body and which delivery modes it requests. */
interface ResolvedRulebook {
  readonly slug: string;
  readonly skillName: string;
  readonly body: string;
  readonly ambient: boolean;
  readonly skill: boolean;
  readonly description: string | undefined;
}

/** One targeted harness's project-local subagents dir paired with the per-harness inputs the deploy transform needs. */
interface HarnessSubagentTarget {
  readonly subagentsDir: string;
  readonly deployContext: SubagentDeployContext;
}

/** One targeted harness's id and project-local skills dir paired with the per-harness inputs the skill transform needs. */
interface HarnessSkillTarget {
  readonly harnessId: HarnessId;
  readonly skillsDir: string;
  readonly deployContext: SkillDeployContext;
}

/** The one per-domain difference: the base dir to resolve and deploy under, and the file that hosts ambient blocks. */
export interface SyncDomain {
  readonly baseDir: string;
  readonly ambientHostPath: string;
  readonly label: 'project' | 'global';
}

/**
 * Resolves a project's `codeassembly.yaml` scope chain and reconciles it into that project's harness dirs (the repo
 * domain). A thin wrapper over `reconcileDomain` that supplies the repo `SyncDomain`. An absent `codeassembly.yaml`
 * is a total no-op.
 *
 * @param projectRoot The project whose `.agents/` directory is synced (defaults to the current directory).
 * @param contentDirOverride Override for the library source (defaults to the package content dir).
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  contentDirOverride?: string,
): Promise<void> {
  if (path.resolve(projectRoot) === path.resolve(homedir())) {
    throw new Error(
      'Refusing to run `sync` in the home directory: that would deploy the user-global tier through the project ' +
        'path. Run `sync --global` to sync the user-global tier into the home harness dirs.',
    );
  }
  await reconcileDomain(
    options,
    { baseDir: projectRoot, ambientHostPath: path.join(projectRoot, '.agents', 'PROJECT.md'), label: 'project' },
    contentDirOverride,
  );
}

/**
 * Resolves the user-global `~/.agents/codeassembly.yaml` scope chain and reconciles it into the home harness dirs (the
 * home domain). A thin wrapper over `reconcileDomain` that supplies the home `SyncDomain`. Ambient blocks land in
 * `~/.agents/GLOBAL.md` so install's whole-file `~/.agents/AGENTS.md` is never co-written. When the home declaration
 * is absent, makes no changes and directs the user to `init --global`.
 *
 * @param homeDir The home directory whose `.agents/` is synced (defaults to the OS home dir; injected in tests).
 * @param contentDirOverride Override for the library source (defaults to the package content dir).
 */
export async function syncGlobalCommand(
  options: InstallOptions,
  homeDir: string = homedir(),
  contentDirOverride?: string,
): Promise<void> {
  const declarationPath = path.join(homeDir, '.agents', 'codeassembly.yaml');
  if (!existsSync(declarationPath)) {
    console.info(
      `No ${declarationPath} found. Run \`codeassembly-agents init --global\` to create one, then re-run \`sync --global\`.`,
    );
    return;
  }
  await reconcileDomain(
    options,
    { baseDir: homeDir, ambientHostPath: path.join(homeDir, '.agents', 'GLOBAL.md'), label: 'global' },
    contentDirOverride,
  );
}

/**
 * Resolves the `codeassembly.yaml` scope chain under `domain.baseDir`, materializes each declared rulebook's neutral
 * body to `<baseDir>/.agents/rulebooks/<slug>.md`, inlines `ambient` rulebooks into `domain.ambientHostPath`, writes
 * `skill` rulebooks as thin-wrapper skills into each targeted harness's skills dir, deploys declared skills and
 * subagents (the latter through the harness transform) into those harness dirs, and retracts anything no longer
 * declared. Installed state is derived from the filesystem, not a manifest, which keeps the command idempotent. An
 * absent `codeassembly.yaml` is a total no-op. Repo and home domains share this one reconciler, differing only in
 * the `SyncDomain` they pass.
 */
async function reconcileDomain(
  options: InstallOptions,
  domain: SyncDomain,
  contentDirOverride?: string,
): Promise<void> {
  const declaration = await resolveDeclaration({ cwd: domain.baseDir });
  if (declaration === undefined) {
    console.info('No .agents/codeassembly.yaml found. Nothing to sync.');
    return;
  }

  const contentDir = contentDirOverride ?? resolveContentDir();

  // Expand declared collections — and any artifact's own dependencies — into the deployable per-type sets before
  // resolving against the library, so a declared collection deploys exactly its transitive closure.
  const closure = await resolveClosure(
    {
      rulebook: declaration.rulebooks,
      skill: declaration.skills,
      subagent: declaration.subagents,
      collection: declaration.collections,
    },
    contentDir,
  );
  const declaredRulebooks = closure.rulebooks;

  const librarySrcDir = path.join(contentDir, 'guidance', 'rulebooks');
  const librarySkillsDir = path.join(contentDir, 'skills');
  const librarySubagentsDir = path.join(contentDir, 'subagents');
  const neutralDir = path.join(domain.baseDir, '.agents', 'rulebooks');
  const ambientHostPath = domain.ambientHostPath;

  // Resolve and validate every declared rulebook, skill, and subagent before writing anything, so a missing library
  // file, invalid frontmatter, or a still-`install` artifact fails the whole run rather than leaving a partial sync.
  const resolved = await Promise.all(declaredRulebooks.map((slug) => resolveRulebook(slug, librarySrcDir)));
  assertNoSkillNameCollisions(resolved);
  const resolvedSkills = await Promise.all(closure.skills.map((slug) => resolveDeclaredSkill(slug, librarySkillsDir)));
  const resolvedSubagents = await Promise.all(
    closure.subagents.map((slug) => resolveDeclaredSubagent(slug, librarySubagentsDir)),
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
  // `projectRoot` as the base is what keeps the skills project-scoped, and keeps tests out of the real home dir. Each
  // target carries the per-harness skill-transform inputs so declared-skill deployment applies include expansion and
  // tool-name/link rewriting. `harnessSkillDirs` is the plain dir list the rulebook-skill passes and orphan scans use,
  // which need no transform context.
  const harnessSkillTargets = await Promise.all(
    resolveHarnessIds(options.harness, domain.baseDir).map((harnessId) =>
      resolveSkillTarget(harnessId, domain.baseDir, contentDir),
    ),
  );
  const harnessSkillDirs = harnessSkillTargets.map((target) => target.skillsDir);

  // Subagent delivery targets each harness's project-local subagents dir, loading that harness's overlay and tool
  // mapping so the deploy applies the same transform `install` would. Resolved separately from skills because the
  // transform is harness-specific, and subagents live in a distinct flat dir from skills.
  const declaredSubagentSet = new Set(resolvedSubagents.map((subagent) => subagent.slug));
  const harnessSubagentTargets = await Promise.all(
    resolveHarnessIds(options.harness, domain.baseDir).map((harnessId) =>
      resolveSubagentTarget(harnessId, domain.baseDir, contentDir),
    ),
  );

  const existingAmbientHost = await readFileOrEmpty(ambientHostPath);
  const neutralOrphans = (await listNeutralSlugs(neutralDir)).filter((slug) => !declaredSet.has(slug));
  const inlineOrphans = extractInstalledSlugs(existingAmbientHost).filter((slug) => !desiredAmbient.has(slug));
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
  // Declared-skill orphans reconcile per harness, reading only the declared-skill marker so the two namespaces never
  // consider each other's dirs. An owned declared-skill dir in a harness is an orphan once its slug is no longer among
  // the declared skills that target that harness — covering both an undeclared skill and one that dropped this harness.
  const declaredSkillOrphansByDir = await Promise.all(
    harnessSkillTargets.map(async ({ skillsDir, harnessId }) => {
      const targetedSlugs = new Set(
        resolvedSkills.filter((skill) => skillTargetsHarness(skill, harnessId)).map((skill) => skill.slug),
      );
      return {
        skillsDir,
        orphans: (await listOwnedDeclaredSkills(skillsDir))
          .filter(({ slug }) => !targetedSlugs.has(slug))
          .map(({ dir }) => dir),
      };
    }),
  );
  // Declared subagents reconcile file-based (flat `.md` files, not directories): an owned subagent file is one whose
  // content carries the `codeassembly-subagent:` marker. It is an orphan once its slug is no longer declared. A
  // marker-less hand-authored file is never claimed, so it survives untouched.
  const subagentOrphansByDir = await Promise.all(
    harnessSubagentTargets.map(async (target) => ({
      subagentsDir: target.subagentsDir,
      orphans: (await listOwnedSubagents(target.subagentsDir))
        .filter(({ slug }) => !declaredSubagentSet.has(slug))
        .map(({ file }) => file),
    })),
  );

  // Before any write or delete, fail closed on any skill or subagent target that already exists without this sync's
  // ownership marker — an install-managed or hand-authored file. The marker-gated retraction scans keep such files
  // from being deleted; this keeps them from being overwritten. Runs in dry-run too, so a preview surfaces the conflict.
  await assertNoForeignOwnedTargets(
    collectOwnedTargets(harnessSkillTargets, resolved, resolvedSkills, harnessSubagentTargets, resolvedSubagents),
  );

  // Render every declared skill against every targeted harness up front, so a broken include or an unmapped tool
  // placeholder fails the whole run — dry-run included — before any file is written. The rendered output is discarded
  // here; `deploySkill` re-renders it at write time.
  await assertDeclaredSkillsRender(harnessSkillTargets, resolvedSkills);

  if (options.dryRun) {
    reportDryRun({
      ambientHostName: path.basename(ambientHostPath),
      resolved,
      retracted: [...new Set([...neutralOrphans, ...inlineOrphans])],
      harnessSkillTargets,
      skillOrphansByDir,
      resolvedSkills,
      declaredSkillOrphansByDir,
      resolvedSubagents,
      harnessSubagentTargets,
      subagentOrphansByDir,
      promptsYmlPaths: resolvePromptsYmlPaths(options, domain),
    });
    return;
  }

  if (resolved.length > 0) {
    await mkdir(neutralDir, { recursive: true });
  }

  // The ambient host file is read once, mutated in memory across all inject/remove operations, and written once.
  let ambientHost = existingAmbientHost;
  for (const rulebook of resolved) {
    await writeIfChanged(path.join(neutralDir, `${rulebook.slug}.md`), rulebook.body);
    if (rulebook.ambient) {
      ambientHost = injectRulebook(ambientHost, rulebook.slug, rulebook.body);
    }
  }
  for (const slug of inlineOrphans) {
    ambientHost = removeRulebook(ambientHost, slug);
  }

  // `.agents/rulebooks/` is sync-owned, so deleting an undeclared neutral file here is safe, not user data loss.
  for (const slug of neutralOrphans) {
    await rm(path.join(neutralDir, `${slug}.md`), { force: true });
  }

  if (ambientHost !== existingAmbientHost) {
    await mkdir(path.dirname(ambientHostPath), { recursive: true });
    await writeFile(ambientHostPath, ambientHost, 'utf8');
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
  await reconcileDeclaredSkills(harnessSkillTargets, declaredSkillOrphansByDir, resolvedSkills);

  // Reconcile declared subagents per targeted harness, independently of the skill passes: retract owned subagent
  // files no longer declared, then deploy each declared subagent as `<subagentsDir>/<slug>.md` with the harness
  // transform applied and the ownership marker stamped.
  await reconcileDeclaredSubagents(harnessSubagentTargets, subagentOrphansByDir, resolvedSubagents);

  await refreshPromptsYml(options, domain);

  const skillRetractions = skillOrphansByDir.reduce((total, harness) => total + harness.orphans.length, 0);
  const skillFilesWritten = desiredSkillDirs.size * harnessSkillDirs.length;
  const declaredSkillRetractions = declaredSkillOrphansByDir.reduce(
    (total, harness) => total + harness.orphans.length,
    0,
  );
  const declaredSkillsDeployed = harnessSkillTargets.reduce(
    (total, { harnessId }) => total + resolvedSkills.filter((skill) => skillTargetsHarness(skill, harnessId)).length,
    0,
  );
  const subagentRetractions = subagentOrphansByDir.reduce((total, harness) => total + harness.orphans.length, 0);
  const subagentsDeployed = resolvedSubagents.length * harnessSubagentTargets.length;
  console.info(
    `Synced ${resolved.length} rulebook(s), ${resolvedSkills.length} declared skill(s), and ` +
      `${resolvedSubagents.length} declared subagent(s); delivered ${skillFilesWritten} rulebook-skill file(s), ` +
      `${declaredSkillsDeployed} declared-skill dir(s), and ${subagentsDeployed} declared-subagent file(s) across ` +
      `${harnessSkillDirs.length} harness(s); retracted ${neutralOrphans.length} neutral file(s), ` +
      `${skillRetractions} rulebook-skill dir(s), ${declaredSkillRetractions} declared-skill dir(s), and ` +
      `${subagentRetractions} declared-subagent file(s).`,
  );
}

// region | Helpers

/** True when a skill targets the given harness — either it names no harnesses (so all) or lists this one. */
function skillTargetsHarness(skill: ResolvedSkill, harnessId: HarnessId): boolean {
  return skill.targetHarnesses === undefined || skill.targetHarnesses.includes(harnessId);
}

/** A planned write whose destination must be sync-owned (or absent) before the write proceeds. */
interface OwnedTarget {
  readonly filePath: string;
  readonly isOwned: (content: string) => boolean;
}

/**
 * Throws when any planned target already exists without this sync's ownership marker — an install-managed or
 * hand-authored file. Failing here, before any write or delete, is what keeps a same-named foreign file from being
 * overwritten; the marker-gated retraction scans separately keep it from being deleted. Absent targets are safe.
 */
async function assertNoForeignOwnedTargets(targets: ReadonlyArray<OwnedTarget>): Promise<void> {
  const foreign: Array<string> = [];
  for (const target of targets) {
    let content: string;
    try {
      content = await readFile(target.filePath, 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    if (!target.isOwned(content)) {
      foreign.push(target.filePath);
    }
  }
  if (foreign.length > 0) {
    throw new Error(
      `Refusing to overwrite ${foreign.length} file(s) not owned by sync (install-managed or hand-authored): ` +
        `${foreign.join(', ')}. Rename or remove them, or retire the conflicting install artifact, then re-run.`,
    );
  }
}

/**
 * Collects the skill and subagent destinations a sync would write, each paired with the predicate that recognizes its
 * own ownership marker, so the pre-write guard can reject any that already exist foreign-owned.
 */
function collectOwnedTargets(
  harnessSkillTargets: ReadonlyArray<HarnessSkillTarget>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  harnessSubagentTargets: ReadonlyArray<HarnessSubagentTarget>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
): ReadonlyArray<OwnedTarget> {
  const targets: Array<OwnedTarget> = [];
  for (const { skillsDir, harnessId } of harnessSkillTargets) {
    for (const rulebook of resolved) {
      if (rulebook.skill) {
        targets.push({
          filePath: path.join(skillsDir, rulebook.skillName, 'SKILL.md'),
          isOwned: (content) => extractRulebookSkillSlug(content) !== undefined,
        });
      }
    }
    for (const skill of resolvedSkills) {
      if (!skillTargetsHarness(skill, harnessId)) {
        continue;
      }
      targets.push({
        filePath: path.join(skillsDir, skill.slug, 'SKILL.md'),
        isOwned: (content) => skillMarker.extractSlug(content) !== undefined,
      });
    }
  }
  for (const target of harnessSubagentTargets) {
    for (const subagent of resolvedSubagents) {
      targets.push({
        filePath: path.join(target.subagentsDir, `${subagent.slug}.md`),
        isOwned: (content) => subagentMarker.extractSlug(content) !== undefined,
      });
    }
  }
  return targets;
}

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
    const slug = skillMarker.extractSlug(content);
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

/**
 * Lists the sync-owned subagents under `subagentsDir` as `{ file, slug }` pairs — the flat `.md` files whose content
 * carries the `codeassembly-subagent:` ownership marker, paired with the slug recovered from it. Reads only that
 * marker, so a marker-less hand-authored file is never claimed. Returns an empty list when the directory is absent;
 * non-`.md` entries and directories are skipped.
 */
async function listOwnedSubagents(subagentsDir: string): Promise<ReadonlyArray<{ file: string; slug: string }>> {
  let entries: ReadonlyArray<Dirent>;
  try {
    entries = await readdir(subagentsDir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ file: string; slug: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(path.join(subagentsDir, entry.name), 'utf8');
    } catch (error: unknown) {
      // A `.md` symlink whose target is gone passes the `isFile()` filter (it follows links) but throws on read.
      if (isEnoent(error)) {
        continue;
      }
      throw error;
    }
    const slug = subagentMarker.extractSlug(content);
    if (slug !== undefined) {
      owned.push({ file: entry.name, slug });
    }
  }
  return owned;
}

/**
 * Retracts owned subagent files no longer declared, then deploys each declared subagent into every targeted harness's
 * subagents dir. Orphans were computed against the pre-write filesystem, so retracting before writing lets a slug
 * freed in one dir be re-created in the same sync rather than clobbered by a later retract.
 */
async function reconcileDeclaredSubagents(
  targets: ReadonlyArray<HarnessSubagentTarget>,
  orphansByDir: ReadonlyArray<{ subagentsDir: string; orphans: ReadonlyArray<string> }>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
): Promise<void> {
  for (const target of targets) {
    const orphans = orphansByDir.find((entry) => entry.subagentsDir === target.subagentsDir)?.orphans ?? [];
    for (const file of orphans) {
      await rm(path.join(target.subagentsDir, file), { force: true });
    }
    for (const subagent of resolvedSubagents) {
      await deploySubagent(subagent, path.join(target.subagentsDir, `${subagent.slug}.md`), target.deployContext);
    }
  }
}

/**
 * Retracts owned declared-skill dirs no longer declared, then deploys each declared skill into every targeted harness's
 * skills dir with that harness's transform applied. Orphans were computed against the pre-write filesystem, so
 * retracting before writing lets a slug freed in one dir be re-created in the same sync rather than clobbered.
 */
async function reconcileDeclaredSkills(
  targets: ReadonlyArray<HarnessSkillTarget>,
  orphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
): Promise<void> {
  for (const target of targets) {
    const orphans = orphansByDir.find((entry) => entry.skillsDir === target.skillsDir)?.orphans ?? [];
    for (const dir of orphans) {
      await rm(path.join(target.skillsDir, dir), { recursive: true, force: true });
    }
    for (const skill of resolvedSkills) {
      if (!skillTargetsHarness(skill, target.harnessId)) {
        continue;
      }
      await deploySkill(skill, path.join(target.skillsDir, skill.slug), target.deployContext);
    }
  }
}

/**
 * Renders every declared skill against every targeted harness, discarding the output, so a broken include or an
 * unmapped tool placeholder throws before any file is written. The deploy pass re-renders at write time; this pass
 * exists only to fail the run closed, including under `--dry-run`.
 */
async function assertDeclaredSkillsRender(
  targets: ReadonlyArray<HarnessSkillTarget>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
): Promise<void> {
  for (const target of targets) {
    for (const skill of resolvedSkills) {
      if (!skillTargetsHarness(skill, target.harnessId)) {
        continue;
      }
      await renderSkillDirectory(skill.srcDir, skill.slug, target.deployContext);
    }
  }
}

/**
 * Reconciles the Rovo Dev `prompts.yml` index so it lists the user-invocable skills currently in the harness skills
 * dir. The deployed skills are projected into a codeassembly-owned region merged into the shared file, preserving any
 * foreign entries; when no skills remain, the region is stripped — and the file deleted when nothing foreign is left. A
 * no-op for non-Rovo Dev harnesses and for a file carrying no codeassembly region. Both domains share this one path, so
 * the home file is merged rather than whole-file overwritten, matching the repo file's non-clobbering shape.
 */
async function refreshPromptsYml(options: InstallOptions, domain: SyncDomain): Promise<void> {
  for (const harnessId of resolveHarnessIds(options.harness, domain.baseDir)) {
    if (harnessId !== 'rovodev') {
      continue;
    }
    const { harnessHome, skillsDir } = resolveHarnessPaths(harnessId, domain.baseDir);
    const promptsPath = path.join(harnessHome, 'prompts.yml');
    const entries = await collectPromptEntries(skillsDir);
    const existing = await readFileOrEmpty(promptsPath);

    if (entries !== undefined && entries.length > 0) {
      await writeIfChanged(promptsPath, injectPromptsRegion(existing, renderPromptEntries(entries)));
      continue;
    }

    // No skills remain: strip our region, deleting the file when nothing foreign survives. A file we never owned (no
    // region) is left untouched.
    if (!hasPromptsRegion(existing)) {
      continue;
    }
    const stripped = removePromptsRegion(existing);
    await (stripped.trim() === '' ? rm(promptsPath, { force: true }) : writeIfChanged(promptsPath, stripped));
  }
}

/** Lists the Rovo Dev `prompts.yml` paths a sync of `domain` would reconcile — one per targeted Rovo Dev harness. */
function resolvePromptsYmlPaths(options: InstallOptions, domain: SyncDomain): ReadonlyArray<string> {
  return resolveHarnessIds(options.harness, domain.baseDir)
    .filter((harnessId) => harnessId === 'rovodev')
    .map((harnessId) => path.join(resolveHarnessPaths(harnessId, domain.baseDir).harnessHome, 'prompts.yml'));
}

/** The writes and retractions the dry-run reporter previews, gathered from the pre-write reconciliation. */
interface DryRunPlan {
  readonly ambientHostName: string;
  readonly resolved: ReadonlyArray<ResolvedRulebook>;
  readonly retracted: ReadonlyArray<string>;
  readonly harnessSkillTargets: ReadonlyArray<HarnessSkillTarget>;
  readonly skillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>;
  readonly resolvedSkills: ReadonlyArray<ResolvedSkill>;
  readonly declaredSkillOrphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>;
  readonly resolvedSubagents: ReadonlyArray<ResolvedSubagent>;
  readonly harnessSubagentTargets: ReadonlyArray<HarnessSubagentTarget>;
  readonly subagentOrphansByDir: ReadonlyArray<{ subagentsDir: string; orphans: ReadonlyArray<string> }>;
  readonly promptsYmlPaths: ReadonlyArray<string>;
}

/** Prints the writes and retractions a real run would perform. */
function reportDryRun(plan: DryRunPlan): void {
  console.info('[dry-run] sync would:');
  for (const rulebook of plan.resolved) {
    const inline = rulebook.ambient ? ` (+ inline into ${plan.ambientHostName})` : '';
    console.info(`  write .agents/rulebooks/${rulebook.slug}.md${inline}`);
    if (rulebook.skill) {
      for (const { skillsDir } of plan.harnessSkillTargets) {
        console.info(`  write ${path.join(skillsDir, rulebook.skillName, 'SKILL.md')}`);
      }
    }
  }
  for (const skill of plan.resolvedSkills) {
    for (const { skillsDir, harnessId } of plan.harnessSkillTargets) {
      if (!skillTargetsHarness(skill, harnessId)) {
        continue;
      }
      console.info(`  deploy declared skill ${path.join(skillsDir, skill.slug)}`);
    }
  }
  for (const subagent of plan.resolvedSubagents) {
    for (const target of plan.harnessSubagentTargets) {
      console.info(`  deploy declared subagent ${path.join(target.subagentsDir, `${subagent.slug}.md`)}`);
    }
  }
  for (const slug of plan.retracted) {
    console.info(`  retract ${slug} (no longer declared, or no longer ambient)`);
  }
  for (const { skillsDir, orphans } of plan.skillOrphansByDir) {
    for (const dir of orphans) {
      console.info(`  retract skill ${path.join(skillsDir, dir)} (no longer the current skill dir)`);
    }
  }
  for (const { skillsDir, orphans } of plan.declaredSkillOrphansByDir) {
    for (const dir of orphans) {
      console.info(`  retract declared skill ${path.join(skillsDir, dir)} (no longer declared)`);
    }
  }
  for (const { subagentsDir, orphans } of plan.subagentOrphansByDir) {
    for (const file of orphans) {
      console.info(`  retract declared subagent ${path.join(subagentsDir, file)} (no longer declared)`);
    }
  }
  for (const promptsPath of plan.promptsYmlPaths) {
    console.info(
      `  reconcile prompts.yml ${promptsPath} (write the codeassembly region, or strip it when no skills remain)`,
    );
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

/**
 * Resolves one harness's project-local subagents dir together with the per-harness inputs the deploy transform needs:
 * the harness overlay YAML, its tool-name mapping, the home-dir segment, and the harness id. Passing `projectRoot` as
 * the base keeps delivery project-scoped, matching the skill passes.
 */
async function resolveSubagentTarget(
  harnessId: HarnessId,
  projectRoot: string,
  contentDir: string,
): Promise<HarnessSubagentTarget> {
  const harnessConfig = HARNESSES[harnessId];
  const overlayYaml = await loadHarnessOverlay(contentDir, harnessConfig);
  return {
    subagentsDir: resolveHarnessPaths(harnessId, projectRoot).subagentsDir,
    deployContext: {
      contentDir,
      overlayYaml,
      toolMapping: loadToolMapping(overlayYaml),
      homeDir: harnessConfig.homeDir,
      harnessId: harnessConfig.id,
      skillSigil: harnessConfig.skillSigil,
      subagentSigil: harnessConfig.subagentSigil,
    },
  };
}

/**
 * Resolves one harness's project-local skills dir together with the per-harness inputs the skill transform needs: the
 * tool-name mapping (from the harness overlay), the link-rewrite prefix, the home-dir segment, and the harness id.
 * Passing `projectRoot` as the base keeps delivery project-scoped.
 */
async function resolveSkillTarget(
  harnessId: HarnessId,
  projectRoot: string,
  contentDir: string,
): Promise<HarnessSkillTarget> {
  const harnessConfig = HARNESSES[harnessId];
  const overlayYaml = await loadHarnessOverlay(contentDir, harnessConfig);
  return {
    harnessId,
    skillsDir: resolveHarnessPaths(harnessId, projectRoot).skillsDir,
    deployContext: {
      contentDir,
      toolMapping: loadToolMapping(overlayYaml),
      pathPrefix: `${harnessConfig.homeDir}/${harnessConfig.skillsDirName}`,
      homeDir: harnessConfig.homeDir,
      harnessId: harnessConfig.id,
      skillSigil: harnessConfig.skillSigil,
      subagentSigil: harnessConfig.subagentSigil,
    },
  };
}

// endregion | Helpers

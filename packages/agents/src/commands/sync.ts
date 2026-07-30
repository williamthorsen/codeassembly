import { constants, type Dirent, existsSync } from 'node:fs';
import { access, mkdir, readdir, readFile, rm, rmdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { appendAmbientRegion, classifyAmbientRegion, injectAmbientRegion } from '../lib/ambient-region.ts';
import { makeArtifactMarker } from '../lib/artifact-marker.ts';
import { ARTIFACT_TYPE_VALUES, type ArtifactType } from '../lib/artifact-types.ts';
import { resolveDeclaration } from '../lib/codeassembly-manifest.ts';
import { resolveContentDir } from '../lib/content-resolver.ts';
import { createSourceResolver, hasLibraryArtifact, type SourceResolver } from '../lib/content-sources.ts';
import { type DirectArtifacts, resolveClosure } from '../lib/dependency-resolver.ts';
import { readDirEntries, readFileOrEmpty, writeIfChanged } from '../lib/fs-helpers.ts';
import { checkGitIgnored } from '../lib/git-ignore.ts';
import { HARNESSES, resolveAmbientHostPath, resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import { loadHarnessOverlay } from '../lib/harness-overlay.ts';
import { enumerateCatalogSlugs } from '../lib/library-catalog.ts';
import { findUndeclaredGuidancePackages, resolvePackageSources } from '../lib/package-sources.ts';
import { collectPromptEntries, renderPromptEntries } from '../lib/prompts-yml.ts';
import { hasPromptsRegion, injectPromptsRegion, removePromptsRegion } from '../lib/prompts-yml-region.ts';
import { type ResolvedRulebook, resolveRulebook } from '../lib/rulebook-deploy.ts';
import { extractRulebookSkillSlug, renderSkillFile } from '../lib/rulebook-skill.ts';
import { renderRulebookBody, type RulebookRenderContext } from '../lib/rulebook-transform.ts';
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
import type { AmbientHostKind, HarnessId, InstallOptions } from '../lib/types.ts';

const skillMarker = makeArtifactMarker('skill');
const subagentMarker = makeArtifactMarker('subagent');

/**
 * One deployed artifact's resolution outcome: its type and slug, the source it resolved from (`undefined` = library),
 * and whether it masks a same-slug library artifact. Drives both the dry-run resolution report and the real-run shadow
 * warning.
 */
interface ResolutionEntry {
  readonly type: ArtifactType;
  readonly slug: string;
  readonly source: string | undefined;
  readonly shadowsLibrary: boolean;
}

/** One targeted harness's project-local subagents dir paired with the per-harness inputs the deploy transform needs. */
interface HarnessSubagentTarget {
  readonly subagentsDir: string;
  readonly deployContext: SubagentDeployContext;
}

/** One targeted harness's ambient host, paired with the harness id whose paths its rulebook bodies render for. */
interface AmbientHostTarget {
  readonly harnessId: HarnessId;
  readonly hostPath: string;
}

/** One targeted harness's id and project-local skills dir paired with the per-harness inputs the skill transform needs. */
interface HarnessSkillTarget {
  readonly harnessId: HarnessId;
  readonly skillsDir: string;
  readonly deployContext: SkillDeployContext;
}

/** The one per-domain difference: the base dir to resolve and deploy under, and where ambient blocks land. */
export interface SyncDomain {
  readonly baseDir: string;
  /**
   * Which guidance file hosts this domain's ambient region. Both domains inject into a per-harness region; they
   * differ only in the host and in who creates it — `install` renders the harness-home region, while `sync` owns
   * the project-local one because `install` does not manage user-local files.
   */
  readonly ambient: AmbientHostKind;
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
    { baseDir: projectRoot, ambient: 'project-local', label: 'project' },
    contentDirOverride,
  );
}

/**
 * Resolves the user-global `~/.agents/codeassembly.yaml` scope chain and reconciles it into the home harness dirs (the
 * home domain). A thin wrapper over `reconcileDomain` that supplies the home `SyncDomain`. Ambient blocks land in the
 * ambient region of each targeted harness's guidance file (e.g. `~/.claude/CLAUDE.md`), which the harness loads
 * mechanically; no agent-read host file is written. When the home declaration is absent, makes no changes and directs
 * the user to `init --global`.
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
  await reconcileDomain(options, { baseDir: homeDir, ambient: 'harness-home', label: 'global' }, contentDirOverride);
  await retireAmbientHost(options, path.join(homeDir, '.agents', 'GLOBAL.md'), true);
}

/**
 * Resolves the `codeassembly.yaml` scope chain under `domain.baseDir`, materializes each declared rulebook's neutral
 * body to `<baseDir>/.agents/rulebooks/<slug>.md`, delivers `ambient` rulebooks to `domain.ambient`'s target, writes
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

  // A declared package contributes both a source and a set of seeds: Its content dir joins the search order below the
  // hand-declared sources, so a hand-pointed local directory outranks a dependency, and everything it ships seeds the
  // closure — which is what makes naming the package the whole declaration.
  const packageSources = await resolvePackageSources(declaration.packages, domain.baseDir);
  const sources = [...declaration.sources, ...packageSources];

  // Resolution searches declared sources (highest precedence first) then the built-in library. Validate each declared
  // source up front so a missing or non-directory source fails the whole run — dry-run included — before any write.
  const resolver = createSourceResolver(sources, contentDir);
  await assertValidSources(sources);

  // Enumerated after validation, so a package whose content dir is missing has already failed the run.
  const packageCatalogs = await Promise.all(packageSources.map((source) => enumerateCatalogSlugs(source.dir)));

  // Expand declared collections — and any artifact's own dependencies — into the deployable per-type sets before
  // resolving against the sources and library, so a declared collection deploys exactly its transitive closure.
  const closure = await resolveClosure(
    mergeSeeds([
      {
        rulebook: declaration.rulebooks,
        skill: declaration.skills,
        subagent: declaration.subagents,
        collection: declaration.collections,
      },
      ...packageCatalogs,
    ]),
    resolver,
  );
  const declaredRulebooks = closure.rulebooks;

  // Resolve and validate every declared rulebook, skill, and subagent before writing anything, so a missing library
  // file, invalid frontmatter, or a still-`install` artifact fails the whole run rather than leaving a partial sync.
  const resolved = await Promise.all(declaredRulebooks.map((slug) => resolveRulebook(slug, resolver)));
  assertNoSkillNameCollisions(resolved);
  const resolvedSkills = await Promise.all(closure.skills.map((slug) => resolveDeclaredSkill(slug, resolver)));
  const resolvedSubagents = await Promise.all(closure.subagents.map((slug) => resolveDeclaredSubagent(slug, resolver)));

  // Maps each skill-delivery rulebook's stable slug to the directory its skill currently belongs in. Retraction
  // compares this against what each owned directory's marker reports, so a renamed skill retracts its old dir.
  const desiredSkillDirs = new Map(
    resolved.filter((rulebook) => rulebook.skill).map((rulebook) => [rulebook.slug, rulebook.skillName] as const),
  );
  const declaredSkillSet = new Set(resolvedSkills.map((skill) => skill.slug));

  // Rulebook skills and declared skills share the project-local skills dirs. A directory name claimed by both
  // delivery namespaces would clobber, so reject the overlap before any write.
  assertNoCrossNamespaceCollisions(desiredSkillDirs.values().toArray(), declaredSkillSet);

  // Every delivery pass below targets this one set of harnesses, and each renders its content for the harness it
  // lands on, so the set is resolved once and threaded rather than re-derived per pass.
  const harnessIds = resolveHarnessIds(options.harness, domain.baseDir);

  // Skill delivery targets project-local harness skills dirs, gated by detection (or `--harness`). Passing
  // `projectRoot` as the base is what keeps the skills project-scoped, and keeps tests out of the real home dir. Each
  // target carries the per-harness skill-transform inputs so declared-skill deployment applies include expansion and
  // tool-name/link rewriting. `harnessSkillDirs` is the plain dir list the rulebook-skill passes and orphan scans use,
  // which need no transform context.
  const harnessSkillTargets = await Promise.all(
    harnessIds.map((harnessId) => resolveSkillTarget(harnessId, domain.baseDir, contentDir)),
  );
  const harnessSkillDirs = harnessSkillTargets.map((target) => target.skillsDir);

  // Subagent delivery targets each harness's project-local subagents dir, loading that harness's overlay and tool
  // mapping so the deploy applies the same transform `install` would. Resolved separately from skills because the
  // transform is harness-specific, and subagents live in a distinct flat dir from skills.
  const declaredSubagentSet = new Set(resolvedSubagents.map((subagent) => subagent.slug));
  const harnessSubagentTargets = await Promise.all(
    harnessIds.map((harnessId) => resolveSubagentTarget(harnessId, domain.baseDir, contentDir)),
  );

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
  // Declared subagents reconcile file-based (flat `.md` files, not directories): An owned subagent file is one whose
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

  // Same gate for rulebooks: a link target the delivery pipeline cannot honor fails the run before either delivery
  // pass writes, rather than shipping a path that resolves to nothing.
  assertRulebooksRender(harnessIds, resolved);

  // Reject a sync-owned ambient host whose region is half-written before anything is written, dry-run included.
  // Appending beside a stray marker is the one path in this command that can destroy hand-authored content.
  const ambientHosts = resolveAmbientHosts(harnessIds, domain);
  await assertAmbientHostsWritable(ambientHosts, domain, resolved);

  // Attribute each deployed artifact to the source it resolved from, flagging any that shadows a same-slug library
  // artifact. Built once, off the write path, and consumed by both the dry-run report and the real-run shadow warning.
  const resolutionReport = await buildResolutionReport(resolver, resolved, resolvedSkills, resolvedSubagents);

  if (options.dryRun) {
    await retireRetiredOutputs(options, domain);
    reportDryRun({
      ambientHostPreviews: await previewAmbientHosts(ambientHosts, domain, resolved),
      resolutionReport,
      resolved,
      harnessSkillTargets,
      skillOrphansByDir,
      resolvedSkills,
      declaredSkillOrphansByDir,
      resolvedSubagents,
      harnessSubagentTargets,
      subagentOrphansByDir,
      promptsYmlPaths: resolvePromptsYmlPaths(harnessIds, domain),
    });
    return;
  }

  await retireRetiredOutputs(options, domain);

  await deliverAmbient(ambientHosts, domain, resolved);

  // Reconcile skill files per targeted harness: Retract sync-owned skill dirs that are no longer current, then
  // write every skill-delivery rulebook. Orphans were computed against the pre-write filesystem, so retracting
  // before writing lets a skill name freed by one rulebook be recreated for another in the same sync, instead
  // of the write being clobbered by a later retract.
  // Iterates the skill targets rather than the orphan scan, because only the targets carry the harness id each
  // rulebook body renders for; the scan is keyed back in by its skills dir.
  const orphansBySkillsDir = new Map(skillOrphansByDir.map(({ skillsDir, orphans }) => [skillsDir, orphans]));
  for (const { harnessId, skillsDir } of harnessSkillTargets) {
    // The scan covers every target's skills dir, so the fallback stands in for the map's optional lookup type only.
    const orphans = orphansBySkillsDir.get(skillsDir) ?? [];
    for (const dir of orphans) {
      await rm(path.join(skillsDir, dir), { recursive: true, force: true });
    }
    const context = resolveRulebookRenderContext(harnessId);
    for (const rulebook of resolved) {
      if (!rulebook.skill) {
        continue;
      }
      const skillDir = path.join(skillsDir, rulebook.skillName);
      await mkdir(skillDir, { recursive: true });
      await writeIfChanged(
        path.join(skillDir, 'SKILL.md'),
        renderSkillFile(
          rulebook.skillName,
          rulebook.slug,
          rulebook.description,
          renderRulebookBody(rulebook.body, rulebook.slug, context),
        ),
      );
    }
  }

  // Reconcile declared skills per targeted harness, independently of the rulebook-skill pass above: Retract owned
  // declared-skill dirs no longer declared, then deploy each declared skill into `<skillsDir>/<slug>/`.
  await reconcileDeclaredSkills(harnessSkillTargets, declaredSkillOrphansByDir, resolvedSkills);

  // Reconcile declared subagents per targeted harness, independently of the skill passes: Retract owned subagent
  // files no longer declared, then deploy each declared subagent as `<subagentsDir>/<slug>.md` with the harness
  // transform applied and the ownership marker stamped.
  await reconcileDeclaredSubagents(harnessSubagentTargets, subagentOrphansByDir, resolvedSubagents);

  await refreshPromptsYml(harnessIds, domain);

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
      `${harnessSkillDirs.length} harness(s); retracted ` +
      `${skillRetractions} rulebook-skill dir(s), ${declaredSkillRetractions} declared-skill dir(s), and ` +
      `${subagentRetractions} declared-subagent file(s).`,
  );

  // A declared source that provides a slug also present in the library shadows it silently. On a real run the report
  // is not printed, so surface any shadow as a warning — this is when the surprising deploy actually takes effect.
  const shadows = resolutionReport.filter((entry) => entry.shadowsLibrary);
  if (shadows.length > 0) {
    console.warn(renderShadowWarning(shadows));
  }

  // Otherwise a consumer has to learn a third party's catalog by hand to discover there is anything to adopt. This is
  // advice, not action: Nothing is deployed until the project declares the package.
  const undeclared = await findUndeclaredGuidancePackages(
    [...declaration.packages, ...declaration.declinedPackages],
    domain.baseDir,
  );
  if (undeclared.length > 0) {
    console.info(renderPackageAdvice(undeclared));
  }
}

// region | Helpers

/** True when a skill targets the given harness; either it names no harnesses (so all) or lists this one. */
function skillTargetsHarness(skill: ResolvedSkill, harnessId: HarnessId): boolean {
  return skill.targetHarnesses === undefined || skill.targetHarnesses.includes(harnessId);
}

/**
 * Throws when any declared source path is missing, not a directory, or unreadable, so a bad source fails the whole
 * run (dry-run included) before any file is touched. The error names each offending source and what is wrong with it.
 */
async function assertValidSources(sources: ReadonlyArray<{ name: string; dir: string }>): Promise<void> {
  const invalid: Array<string> = [];
  for (const source of sources) {
    const problem = await describeSourceProblem(source.dir);
    if (problem !== undefined) {
      invalid.push(`"${source.name}" (${source.dir}): ${problem}`);
    }
  }
  if (invalid.length > 0) {
    throw new Error(
      `Invalid declared source(s): ${invalid.join('; ')}. Each source path must be an existing, readable directory.`,
    );
  }
}

/**
 * Reports what disqualifies `dir` as a source (that it is missing, not a directory, or unreadable) or `undefined`
 * when valid. Validity requires both that `dir` is a directory and that the process can read and traverse it, because
 * `stat` alone passes a directory that is itself unreadable (`stat` needs only search permission on the parent chain,
 * not on `dir`). Any permission failure (from the `stat` or the read-and-traverse access probe) folds into the
 * "unreadable" case so it surfaces through the attributed `Invalid declared source(s)` error naming `dir`.
 */
async function describeSourceProblem(dir: string): Promise<string | undefined> {
  try {
    if (!(await stat(dir)).isDirectory()) {
      return 'not a directory';
    }
    // Probe the read+traverse access the resolver's frontmatter lookups rely on, so a directory that stats as a
    // directory but is itself unreadable (e.g. mode 000) fails here with the attributed error rather than as a raw
    // EACCES mid-resolution — or not at all when no declared artifact happens to reach into it.
    await access(dir, constants.R_OK | constants.X_OK);
    return undefined;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return 'does not exist';
    }
    return `unreadable — ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Concatenates per-type seed sets into the one set that seeds closure resolution. Deduping is deliberately left out:
 * `resolveClosure` already dedupes by slug as it walks, so a slug both declared directly and enumerated from a
 * package's catalog is visited once.
 */
function mergeSeeds(sets: ReadonlyArray<DirectArtifacts>): DirectArtifacts {
  const merged: Record<ArtifactType, Array<string>> = { rulebook: [], skill: [], subagent: [], collection: [] };
  for (const set of sets) {
    for (const type of ARTIFACT_TYPE_VALUES) {
      merged[type].push(...(set[type] ?? []));
    }
  }
  return merged;
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
  const collisions = new Set(rulebookSkillDirs).intersection(declaredSkillSlugs);
  if (collisions.size > 0) {
    throw new Error(
      `Skill directory name collision across delivery namespaces: ${Array.from(collisions).join(', ')} ` +
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
      await renderSkillDirectory(skill.srcDir, skill.slug, skill.contentRoot, target.deployContext);
    }
  }
}

/**
 * Renders every resolved rulebook against every targeted harness, discarding the output, so a link target the
 * delivery pipeline cannot honor throws before any file is written. Both delivery passes re-render at write time;
 * this pass exists only to fail the run closed, including under `--dry-run`.
 */
function assertRulebooksRender(harnessIds: ReadonlyArray<HarnessId>, resolved: ReadonlyArray<ResolvedRulebook>): void {
  for (const harnessId of harnessIds) {
    const context = resolveRulebookRenderContext(harnessId);
    for (const rulebook of resolved) {
      renderRulebookBody(rulebook.body, rulebook.slug, context);
    }
  }
}

/**
 * Delivers the resolved ambient rulebooks into the ambient region of each targeted harness's host, regenerating the
 * region's content wholesale (an empty ambient set empties an existing region). Both domains share this one path,
 * differing only in the host each targets and in who owns region creation there.
 */
async function deliverAmbient(
  hosts: ReadonlyArray<AmbientHostTarget>,
  domain: SyncDomain,
  resolved: ReadonlyArray<ResolvedRulebook>,
): Promise<void> {
  for (const { harnessId, hostPath } of hosts) {
    const body = renderAmbientBody(resolved, harnessId);
    const plan = planAmbientHost(domain.ambient, await probeAmbientHost(hostPath), hostPath, body);
    if (plan.kind === 'skip') {
      if (plan.warn) {
        console.warn(`⚠️ Skipping ambient delivery: ${plan.reason}`);
      }
      continue;
    }
    if (domain.ambient === 'project-local') {
      await warnWhenHostNotIgnored(domain.baseDir, hostPath);
    }
    await writeIfChanged(hostPath, plan.content);
  }
}

/** A probed ambient host: its content when present, plus how its region stands. */
type AmbientHostState =
  { readonly status: 'missing' } | { readonly status: 'malformed' | 'no-region' | 'ready'; readonly content: string };

/**
 * What a sync would do to one ambient host: write the given content, or skip for the given reason. `warn` marks a
 * skip the user should hear about — a stale install on the harness-home path — as opposed to the ordinary case of a
 * scope that simply declares no ambient rulebooks.
 */
type AmbientHostPlan =
  | { readonly kind: 'skip'; readonly reason: string; readonly warn: boolean }
  | { readonly kind: 'write'; readonly action: 'append' | 'create' | 'inject'; readonly content: string };

/** The reason a harness-home guidance file is skipped for ambient delivery, naming the remedy. */
function describeAmbientSkip(status: 'malformed' | 'missing' | 'no-region', guidanceFile: string): string {
  switch (status) {
    case 'missing':
      return `${guidanceFile} does not exist. Run \`codeassembly-agents install\`, then re-run \`sync --global\`.`;
    case 'no-region':
      return `${guidanceFile} carries no ambient region. Run \`codeassembly-agents install\` to refresh it, then re-run \`sync --global\`.`;
    case 'malformed':
      return `${guidanceFile} carries a damaged ambient region — an unmatched marker, or more than one region. Repair its codeassembly-ambient markers, then re-run \`sync --global\`.`;
  }
}

/** The dry-run line for one host's plan, naming the host and the action a real run would take on it. */
function describeAmbientHostPlan(hostPath: string, plan: AmbientHostPlan): string {
  if (plan.kind === 'skip') {
    return `  skip ambient delivery: ${plan.reason}`;
  }
  switch (plan.action) {
    case 'append':
      return `  append the ambient region to ${hostPath}`;
    case 'create':
      return `  create ${hostPath}, carrying the ambient region`;
    case 'inject':
      return `  inject the ambient region in ${hostPath}`;
  }
}

/**
 * Decides what a sync does to one ambient host. The harness-home host is `install`'s to create, so anything but a
 * rendered region is skipped with the remedy named. The project-local host is sync's own, and is materialized only
 * when there is ambient content to carry: an absent host with nothing to deliver stays absent, matching how the
 * `prompts.yml` region and the legacy ambient host withdraw rather than persist empty.
 */
function planAmbientHost(
  hostKind: AmbientHostKind,
  host: AmbientHostState,
  hostPath: string,
  body: string,
): AmbientHostPlan {
  if (host.status === 'ready') {
    return { kind: 'write', action: 'inject', content: injectAmbientRegion(host.content, body) };
  }
  if (hostKind === 'harness-home') {
    return { kind: 'skip', reason: describeAmbientSkip(host.status, hostPath), warn: true };
  }
  if (body === '') {
    return { kind: 'skip', reason: `${hostPath} is not needed: no ambient rulebooks are declared.`, warn: false };
  }
  // A damaged region never reaches a write: `assertAmbientHostsWritable` has already failed the run.
  return host.status === 'malformed'
    ? { kind: 'skip', reason: `${hostPath} carries a damaged ambient region.`, warn: false }
    : {
        kind: 'write',
        action: host.status === 'missing' ? 'create' : 'append',
        content: appendAmbientRegion(host.status === 'missing' ? '' : host.content, body),
      };
}

/** Pairs each targeted host with the plan a real run would carry out, so the dry-run preview cannot drift from it. */
async function previewAmbientHosts(
  hosts: ReadonlyArray<AmbientHostTarget>,
  domain: SyncDomain,
  resolved: ReadonlyArray<ResolvedRulebook>,
): Promise<ReadonlyArray<string>> {
  return Promise.all(
    hosts.map(async ({ harnessId, hostPath }) =>
      describeAmbientHostPlan(
        hostPath,
        planAmbientHost(
          domain.ambient,
          await probeAmbientHost(hostPath),
          hostPath,
          renderAmbientBody(resolved, harnessId),
        ),
      ),
    ),
  );
}

/**
 * Warns when a host `sync` is about to write is not git-ignored, so machine-local guidance does not quietly become a
 * commit candidate. Purely advisory: an ignored host says nothing, and so does a check that cannot answer — the
 * project may not be a repository at all, which is no reason to fail a sync.
 */
async function warnWhenHostNotIgnored(projectRoot: string, hostPath: string): Promise<void> {
  if ((await checkGitIgnored(projectRoot, hostPath)) === false) {
    console.warn(
      `⚠️ ${hostPath} is not git-ignored. It carries machine-local guidance, so add it to .gitignore to keep it ` +
        'out of version control.',
    );
  }
}

/** Probes an ambient host for its content and region state. */
async function probeAmbientHost(hostPath: string): Promise<AmbientHostState> {
  let content: string;
  try {
    content = await readFile(hostPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return { status: 'missing' };
    }
    throw error;
  }
  switch (classifyAmbientRegion(content)) {
    case 'complete':
      return { status: 'ready', content };
    case 'malformed':
      return { status: 'malformed', content };
    case 'absent':
      return { status: 'no-region', content };
  }
}

/**
 * Throws when a host `sync` would write already carries a damaged region — an unmatched marker, or more than one.
 * Only the sync-owned project-local host can be appended to, so only it needs the guard; the harness-home path skips
 * such a file with a warning instead. Runs before any write so a dry-run surfaces the conflict with nothing changed.
 */
async function assertAmbientHostsWritable(
  hosts: ReadonlyArray<AmbientHostTarget>,
  domain: SyncDomain,
  resolved: ReadonlyArray<ResolvedRulebook>,
): Promise<void> {
  // Asks whether anything would be delivered, which is a property of the declaration alone. Rendering could answer it
  // too, but rendering can now fail on a bad link, and this guard is about region damage rather than link validity.
  if (domain.ambient !== 'project-local' || resolved.every((rulebook) => !rulebook.ambient)) {
    return;
  }
  const malformed: Array<string> = [];
  for (const { hostPath } of hosts) {
    if ((await probeAmbientHost(hostPath)).status === 'malformed') {
      malformed.push(hostPath);
    }
  }
  if (malformed.length > 0) {
    throw new Error(
      `Refusing to deliver ambient guidance into ${malformed.length} file(s) carrying a damaged ambient region ` +
        `(an unmatched marker, or more than one region): ${malformed.join(', ')}. Repair the codeassembly-ambient ` +
        'markers, then re-run.',
    );
  }
}

/**
 * Retires a former ambient host: removes the sync-owned rulebook blocks it carries and writes back the stripped
 * remainder, so hand-authored content survives. Ambient delivery targets the harness regions now, and a lingering
 * copy would present stale guidance as current. `deleteWhenEmpty` deletes a host left holding nothing — right for
 * one sync created itself, wrong for a hand-authored file like `.agents/PROJECT.md`, which is never deleted. A
 * missing host, and one carrying nothing to retire, are both no-ops.
 */
async function retireAmbientHost(options: InstallOptions, hostPath: string, deleteWhenEmpty: boolean): Promise<void> {
  let content: string;
  try {
    content = await readFile(hostPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return;
    }
    throw error;
  }

  let stripped = content;
  for (const slug of extractInstalledSlugs(content)) {
    stripped = removeRulebook(stripped, slug);
  }
  const deletable = deleteWhenEmpty && stripped.trim() === '';
  if (stripped === content && !deletable) {
    return;
  }

  if (options.dryRun) {
    console.info(
      deletable
        ? `[dry-run] sync would delete ${hostPath}, which holds only retired rulebook blocks`
        : `[dry-run] sync would retire the rulebook blocks in ${hostPath}`,
    );
    return;
  }
  await (deletable ? rm(hostPath, { force: true }) : writeIfChanged(hostPath, stripped));
}

/**
 * Retires the neutral rulebook tree at `<baseDir>/.agents/rulebooks/`. Nothing reads it, so it is removed rather than
 * maintained. Only the `.md` files sync materialized are deleted, and the directory itself only once nothing else
 * remains in it, so anything a user placed alongside them survives. A missing directory is a no-op.
 */
async function retireNeutralRulebooks(options: InstallOptions, baseDir: string): Promise<void> {
  const neutralDir = path.join(baseDir, '.agents', 'rulebooks');
  if (!existsSync(neutralDir)) {
    return;
  }

  if (options.dryRun) {
    console.info(`[dry-run] sync would retire the neutral rulebook tree ${neutralDir}`);
    return;
  }
  const entries = await readDirEntries(neutralDir);
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.md')) {
      await rm(path.join(neutralDir, entry.name), { force: true });
    }
  }
  if ((await readDirEntries(neutralDir)).length === 0) {
    await rmdir(neutralDir);
  }
}

/**
 * Retires the outputs this domain no longer produces: the neutral rulebook tree in both domains, and, in the project
 * domain, the rulebook blocks `.agents/PROJECT.md` used to host. Runs on every sync that has a declaration to act on,
 * so a project picks the retirement up on its next run rather than needing a migration step.
 */
async function retireRetiredOutputs(options: InstallOptions, domain: SyncDomain): Promise<void> {
  await retireNeutralRulebooks(options, domain.baseDir);
  if (domain.ambient === 'project-local') {
    await retireAmbientHost(options, path.join(domain.baseDir, '.agents', 'PROJECT.md'), false);
  }
}

/**
 * Renders the ambient rulebooks as concatenated sentinel blocks — the wholesale content of one harness's ambient
 * region. Each body is rendered for `harnessId`, so the same rulebook yields that harness's own absolute paths.
 */
function renderAmbientBody(resolved: ReadonlyArray<ResolvedRulebook>, harnessId: HarnessId): string {
  const context = resolveRulebookRenderContext(harnessId);
  let body = '';
  for (const rulebook of resolved) {
    if (rulebook.ambient) {
      body = injectRulebook(body, rulebook.slug, renderRulebookBody(rulebook.body, rulebook.slug, context));
    }
  }
  return body;
}

/** The per-harness inputs a rulebook render depends on, read off the harness config. */
function resolveRulebookRenderContext(harnessId: HarnessId): RulebookRenderContext {
  const config = HARNESSES[harnessId];
  return { homeDir: config.homeDir, harnessId: config.id };
}

/**
 * Lists the guidance files whose ambient regions a sync of `domain` targets — one per targeted harness, each paired
 * with the harness id its content is rendered for.
 */
function resolveAmbientHosts(
  harnessIds: ReadonlyArray<HarnessId>,
  domain: SyncDomain,
): ReadonlyArray<AmbientHostTarget> {
  return harnessIds.map((harnessId) => ({
    harnessId,
    hostPath: resolveAmbientHostPath(harnessId, domain.ambient, domain.baseDir),
  }));
}

/**
 * Reconciles the Rovo Dev `prompts.yml` index so it lists the user-invocable skills currently in the harness skills
 * dir. The deployed skills are projected into a codeassembly-owned region merged into the shared file, preserving any
 * foreign entries; when no skills remain, the region is stripped — and the file deleted when nothing foreign is left. A
 * no-op for non-Rovo Dev harnesses and for a file carrying no codeassembly region. Both domains share this one path, so
 * the home file is merged rather than whole-file overwritten, matching the repo file's non-clobbering shape.
 */
async function refreshPromptsYml(harnessIds: ReadonlyArray<HarnessId>, domain: SyncDomain): Promise<void> {
  for (const harnessId of harnessIds) {
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
function resolvePromptsYmlPaths(harnessIds: ReadonlyArray<HarnessId>, domain: SyncDomain): ReadonlyArray<string> {
  return harnessIds
    .filter((harnessId) => harnessId === 'rovodev')
    .map((harnessId) => path.join(resolveHarnessPaths(harnessId, domain.baseDir).harnessHome, 'prompts.yml'));
}

/** The writes and retractions the dry-run reporter previews, gathered from the pre-write reconciliation. */
interface DryRunPlan {
  /** One rendered line per targeted ambient host, naming it and the action a real run would take. */
  readonly ambientHostPreviews: ReadonlyArray<string>;
  readonly resolutionReport: ReadonlyArray<ResolutionEntry>;
  readonly resolved: ReadonlyArray<ResolvedRulebook>;
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
  if (plan.resolutionReport.length > 0) {
    console.info(renderResolutionReport(plan.resolutionReport));
  }
  console.info('[dry-run] sync would:');
  for (const preview of plan.ambientHostPreviews) {
    console.info(preview);
  }
  for (const rulebook of plan.resolved) {
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

/** Rank used to group resolution entries by type before the within-type slug sort, matching `library list`'s order. */
const ARTIFACT_TYPE_ORDER: Readonly<Record<ArtifactType, number>> = {
  rulebook: 0,
  skill: 1,
  subagent: 2,
  collection: 3,
};

/**
 * Attributes each deployed rulebook, skill, and subagent to the source it resolved from, flagging any source-resolved
 * artifact whose slug also exists in the library as shadowing it. The library probe runs only for source-resolved
 * artifacts — a library-resolved artifact cannot shadow the library — and is batched across all of them.
 */
async function buildResolutionReport(
  resolver: SourceResolver,
  rulebooks: ReadonlyArray<ResolvedRulebook>,
  skills: ReadonlyArray<ResolvedSkill>,
  subagents: ReadonlyArray<ResolvedSubagent>,
): Promise<ReadonlyArray<ResolutionEntry>> {
  const artifacts: Array<{ type: ArtifactType; slug: string; source: string | undefined }> = Array.from(
    rulebooks,
    (rulebook) => ({ type: 'rulebook', slug: rulebook.slug, source: rulebook.source }),
  );
  for (const skill of skills) {
    artifacts.push({ type: 'skill', slug: skill.slug, source: skill.source });
  }
  for (const subagent of subagents) {
    artifacts.push({ type: 'subagent', slug: subagent.slug, source: subagent.source });
  }
  return Promise.all(
    artifacts.map(async (artifact) => ({
      ...artifact,
      shadowsLibrary:
        artifact.source !== undefined && (await hasLibraryArtifact(resolver, artifact.type, artifact.slug)),
    })),
  );
}

/** Orders resolution entries by artifact type, then by slug, so the report is deterministic. */
function compareResolutionEntries(a: ResolutionEntry, b: ResolutionEntry): number {
  if (a.type !== b.type) {
    return ARTIFACT_TYPE_ORDER[a.type] - ARTIFACT_TYPE_ORDER[b.type];
  }
  return a.slug.localeCompare(b.slug);
}

/**
 * Renders the per-artifact resolution report — each deployed artifact and the source it resolved from (`← library` or
 * `← source "<name>"`), with `(shadows library)` appended on a shadow — sorted by type then slug. Type and slug columns
 * are padded for scannability. Pure and deterministic for a given entry set.
 */
function renderResolutionReport(entries: ReadonlyArray<ResolutionEntry>): string {
  const sorted = entries.toSorted(compareResolutionEntries);
  const typeWidth = Math.max(...sorted.map((entry) => entry.type.length));
  const slugWidth = Math.max(...sorted.map((entry) => entry.slug.length));
  const lines = sorted.map((entry) => {
    const origin = entry.source === undefined ? 'library' : `source "${entry.source}"`;
    const shadow = entry.shadowsLibrary ? ' (shadows library)' : '';
    return `  ${entry.type.padEnd(typeWidth)}  ${entry.slug.padEnd(slugWidth)}  ← ${origin}${shadow}`;
  });
  return ['[dry-run] sync would resolve:', ...lines].join('\n');
}

/**
 * Renders the advice naming each dependency that ships content the project has not declared, as the `packages:` block
 * that adopts them. Emitted as the block rather than as prose so it can be pasted rather than transcribed.
 */
function renderPackageAdvice(names: ReadonlyArray<string>): string {
  const subject = names.length === 1 ? 'dependency ships' : 'dependencies ship';
  const entries = names.map((name) => `    - '${name}'`).join('\n');
  return (
    `💡 ${names.length} ${subject} CodeAssembly guidance this project has not declared. ` +
    `To adopt, add to .agents/codeassembly.yaml:\n\npackages:\n  use:\n${entries}\n`
  );
}

/** Renders the real-run warning naming each deployed artifact that shadows a same-slug library artifact. */
function renderShadowWarning(shadows: ReadonlyArray<ResolutionEntry>): string {
  const details = shadows
    .toSorted(compareResolutionEntries)
    .map((entry) => `${entry.type} "${entry.slug}" (source "${entry.source}")`)
    .join(', ');
  const plural = shadows.length === 1 ? '' : 's';
  const verb = shadows.length === 1 ? 's' : '';
  return `⚠️ ${shadows.length} artifact${plural} shadow${verb} a library slug: ${details}`;
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

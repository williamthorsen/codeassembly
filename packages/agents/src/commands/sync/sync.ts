import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { ARTIFACT_TYPE_VALUES, type ArtifactType } from '../../lib/artifact-types.ts';
import { resolveDeclaration } from '../../lib/codeassembly-manifest.ts';
import { resolveContentDir } from '../../lib/content-resolver.ts';
import { createSourceResolver, hasLibraryArtifact, type SourceResolver } from '../../lib/content-sources.ts';
import { listDeclaredGuidanceHooks } from '../../lib/declared-guidance-hooks.ts';
import { type DeclaredSource, resolveDeclaredSources } from '../../lib/declared-sources.ts';
import { type DirectArtifacts, resolveSeedClosures } from '../../lib/dependency-resolver.ts';
import { recordFailedHomeAttempt, recordHomeProvenance } from '../../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../../lib/home-writer-guard.ts';
import { enumerateCatalogSlugs } from '../../lib/library-catalog.ts';
import { findUndeclaredGuidancePackages } from '../../lib/package-sources.ts';
import { type ResolvedRulebook, resolveRulebook } from '../../lib/rulebook-deploy.ts';
import { resolveRunningPackageRoot } from '../../lib/running-package.ts';
import { resolveDeclaredSkill, type ResolvedSkill } from '../../lib/skill-deploy.ts';
import { resolveDeclaredSubagent, type ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import { resolveTargetHarnesses } from '../../lib/target-harnesses.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { deliverAmbient, findUnignoredHosts, planAmbientHosts, probeAmbientHosts } from './ambient-hosts.ts';
import { reconcileDeclaredSkills, reconcileDeclaredSubagents, reconcileRulebookSkills } from './artifact-delivery.ts';
import { planDroppedHarnessRetractions, retractDroppedHarnesses } from './harness-retraction.ts';
import { buildGuidanceHookFills, findGuidanceHookAdvisories } from './hook-bindings.ts';
import { retireAmbientHost, type Retirement, retireRetiredOutputs } from './legacy-retirement.ts';
import { findDeclaredSkillOrphans, findRulebookSkillOrphans, findSubagentOrphans } from './owned-artifacts.ts';
import {
  collectOwnedTargets,
  createDefectCollector,
  dropUnresolvableSeeds,
  findBoundRulebookHookDefects,
  findCrossNamespaceCollisionDefects,
  findDamagedAmbientHostDefects,
  findDeclaredSkillRenderDefects,
  findDeclaredSubagentRenderDefects,
  findForeignOwnedTargetDefects,
  findRulebookRenderDefects,
  findSkillNameCollisionDefects,
  findUnresolvableBindingDefects,
  findUnresolvableDeclaredArtifactDefects,
  resolveEachArtifact,
  type UnresolvableSlugs,
} from './pre-write-gates.ts';
import { refreshPromptsYml, resolvePromptsYmlPaths } from './prompts-index.ts';
import { recordDeployedSizes } from './record-deployed-sizes.ts';
import {
  buildRulebookInvocationCatalog,
  createAnchorContextResolver,
  createOverlayLoader,
  createRulebookContextResolver,
  resolveSkillTarget,
  resolveSubagentTarget,
} from './render-contexts.ts';
import { planSourceSupportRetractions, reconcileSourceSupport, renderSourceSupportPlans } from './source-support.ts';
import type { SyncDomain } from './sync-domain.ts';
import type { ResolutionEntry, SyncOutcome, SyncPlan } from './sync-plan.ts';
import { describeSyncFailure, SyncValidationError } from './sync-validation-error.ts';

/**
 * Resolves a project's `codeassembly.yaml` scope chain and reconciles it into that project's harness dirs (the repo
 * domain). A thin wrapper over `reconcileDomain` that supplies the repo `SyncDomain`. An absent `codeassembly.yaml`
 * is a total no-op. The home directory decides targeting, through its declaration tier and the harnesses installed
 * under it.
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  contentDirOverride?: string,
  homeDir: string = homedir(),
): Promise<SyncOutcome> {
  if (path.resolve(projectRoot) === path.resolve(homeDir)) {
    throw new Error(
      'Refusing to run `sync` in the home directory: That would deploy the user-global tier through the project ' +
        'path. Run `sync --global` to sync the user-global tier into the home harness dirs.',
    );
  }
  return reconcileDomain(
    options,
    { baseDir: projectRoot, ambient: 'project-local', anchorBase: path.resolve(projectRoot) },
    homeDir,
    contentDirOverride,
  );
}

/**
 * Resolves the user-global `~/.agents/codeassembly.yaml` scope chain and reconciles it into the home harness dirs (the
 * home domain). A thin wrapper over `reconcileDomain` that supplies the home `SyncDomain`. Writes ambient blocks into
 * the ambient region of each targeted harness's guidance file (e.g. `~/.claude/CLAUDE.md`), which the harness loads
 * mechanically; no agent-read host file is written. When the home declaration is absent, changes nothing and returns
 * the outcome naming `init --global` as the remedy.
 */
export async function syncGlobalCommand(
  options: InstallOptions,
  homeDir: string = homedir(),
  contentDirOverride?: string,
): Promise<SyncOutcome> {
  // Runs first, and before the dry-run gate: A preview must refuse wherever the real run would.
  await assertDesignatedWriter({
    command: 'sync --global',
    homeDir,
    packageRoot: resolveRunningPackageRoot(),
    shouldOverrideWriter: options.shouldOverrideWriter,
  });

  const declarationPath = path.join(homeDir, '.agents', 'codeassembly.yaml');
  if (!existsSync(declarationPath)) {
    return { kind: 'no-declaration', declarationPath, scope: 'global' };
  }
  let outcome: SyncOutcome;
  let retirement: Retirement | undefined;
  try {
    outcome = await reconcileDomain(
      options,
      { baseDir: homeDir, ambient: 'harness-home', anchorBase: '~' },
      homeDir,
      contentDirOverride,
    );
    retirement = await retireAmbientHost(options, path.join(homeDir, '.agents', 'GLOBAL.md'), true);
  } catch (error: unknown) {
    // Recorded past the designated-writer guard above, so an installation refused by the guard touches no home state.
    if (!options.dryRun) {
      await recordFailedHomeAttempt('sync --global', describeSyncFailure(error), homeDir);
    }
    throw error;
  }

  if (!options.dryRun) {
    await recordHomeProvenance('sync --global', homeDir);
  }

  if (retirement === undefined || outcome.kind !== 'reconciled') {
    return outcome;
  }
  return { ...outcome, plan: { ...outcome.plan, retirements: [...outcome.plan.retirements, retirement] } };
}

/**
 * Resolves the `codeassembly.yaml` scope chain under `domain.baseDir`, materializes each declared rulebook's neutral
 * body to `<baseDir>/.agents/rulebooks/<slug>.md`, delivers `ambient` rulebooks to `domain.ambient`'s target, writes
 * `skill` rulebooks as thin-wrapper skills into each targeted harness's skills dir, deploys declared skills and
 * subagents (the latter through the harness transform) into those harness dirs, and retracts anything no longer
 * declared. Installed state is derived from the filesystem, not a manifest, which keeps the command idempotent. An
 * absent `codeassembly.yaml` is a total no-op. Repo and home domains share this one reconciler, differing only in
 * the `SyncDomain` that they pass.
 *
 * `homeDir` is a parameter rather than a `SyncDomain` field because it is the same directory in both domains: It
 * contains the user-global half of the `harnesses` chain and the harnesses to which targeting falls back.
 */
async function reconcileDomain(
  options: InstallOptions,
  domain: SyncDomain,
  homeDir: string,
  contentDirOverride?: string,
): Promise<SyncOutcome> {
  const declaration = await resolveDeclaration({
    cwd: domain.baseDir,
    domain: domain.ambient === 'harness-home' ? 'home' : 'project',
  });
  if (declaration === undefined) {
    return {
      kind: 'no-declaration',
      declarationPath: path.join(domain.baseDir, '.agents', 'codeassembly.yaml'),
      scope: domain.ambient === 'harness-home' ? 'global' : 'project',
    };
  }

  const contentDir = contentDirOverride ?? resolveContentDir();

  // Resolution searches declared sources (highest precedence first) then the built-in library. Every declared source
  // is validated up front, so a non-directory or unreadable one fails the whole run (dry-run included) before any
  // write.
  const { sources, missingSources } = await resolveDeclaredSources({
    baseDir: domain.baseDir,
    contentDir,
    declaration,
  });
  const resolver = createSourceResolver(sources, contentDir);

  // Everything a declared package ships seeds the closure, which makes naming the package the whole declaration. A
  // package whose content dir is missing enumerates nothing: The walk reads through a directory listing that returns
  // no entries for an absent directory.
  const packageCatalogs = await Promise.all(
    sources.filter((source) => source.declaredAs === 'package').map((source) => enumerateCatalogSlugs(source.dir)),
  );

  // Because every gate in this phase reports into one collector rather than throwing, a run reports every defect that
  // it found instead of its first. The list is raised below, before the first call that writes.
  const defects = createDefectCollector();

  // Checked before the closure resolves so that a typo names the hook that bound it or the file that declared it;
  // seeding alone would report only that some artifact went missing.
  const bound = await findUnresolvableBindingDefects(declaration.guidanceHooks, resolver);
  defects.add(bound.defects);
  const declared = await findUnresolvableDeclaredArtifactDefects(
    declaration,
    domain.ambient === 'harness-home' ? 'home' : 'project',
    resolver,
  );
  defects.add(declared.defects);
  // A binding seeds the closure, so a bound rulebook resolving from nowhere belongs in the declared set skipped by
  // the walk.
  const unresolvable: UnresolvableSlugs = {
    ...declared.unresolvable,
    rulebook: new Set([...declared.unresolvable.rulebook, ...bound.unresolvable]),
  };

  // Expand declared collections (and any artifact's own dependencies) into the deployable per-type sets before
  // resolving against the sources and library, so that a declared collection deploys exactly its transitive closure.
  // Because the walk runs one seed at a time, a bad edge is attributed to the artifact that owns it and every
  // remaining seed still resolves. A seed already reported as unresolvable is dropped, so that it is not reported
  // twice.
  const seeded = await resolveSeedClosures(
    dropUnresolvableSeeds(
      mergeSeeds([
        {
          rulebook: declaration.rulebooks,
          skill: declaration.skills,
          subagent: declaration.subagents,
          collection: declaration.collections,
        },
        // A binding is a dependency edge: A bound rulebook deploys per its own `delivery:` without being declared twice.
        { rulebook: [...new Set(declaration.guidanceHooks.values().toArray().flat())] },
        ...packageCatalogs,
      ]),
      unresolvable,
    ),
    resolver,
  );
  defects.add(seeded.defects);
  const closure = seeded.closure;
  const declaredRulebooks = closure.rulebooks;

  // Resolve and validate every declared rulebook, skill, and subagent before writing anything, so that a missing
  // library file, invalid frontmatter, or a still-`install` artifact is reported rather than leaving a partial sync.
  // Each pass resolves what it can: An artifact reported here is simply absent from the passes below.
  const rulebookResolution = await resolveEachArtifact('rulebook', declaredRulebooks, (slug) =>
    resolveRulebook(slug, resolver),
  );
  const resolved = rulebookResolution.resolved;
  defects.add(rulebookResolution.defects);
  defects.add(findSkillNameCollisionDefects(resolved));
  defects.add(findBoundRulebookHookDefects(declaration.guidanceHooks, resolved));
  const skillResolution = await resolveEachArtifact('skill', closure.skills, (slug) =>
    resolveDeclaredSkill(slug, resolver),
  );
  const resolvedSkills = skillResolution.resolved;
  defects.add(skillResolution.defects);
  const subagentResolution = await resolveEachArtifact('subagent', closure.subagents, (slug) =>
    resolveDeclaredSubagent(slug, resolver),
  );
  const resolvedSubagents = subagentResolution.resolved;
  defects.add(subagentResolution.defects);

  // Maps each skill-delivery rulebook's stable slug to the directory in which its skill currently belongs. Retraction
  // compares this against what each owned directory's marker reports, so it retracts the old dir of a renamed skill.
  const desiredSkillDirs = new Map(
    resolved.filter((rulebook) => rulebook.skill).map((rulebook) => [rulebook.slug, rulebook.skillName] as const),
  );

  // One catalog for every body that addresses a rulebook by token (rulebook, skill, and subagent alike), so that no
  // two passes can disagree about what is addressable. The closure that it indexes already contains a rulebook named
  // only by a skill's or subagent's token, since those tokens are dependency edges.
  const rulebookCatalog = buildRulebookInvocationCatalog(resolved);
  const declaredSkillSet = new Set(resolvedSkills.map((skill) => skill.slug));

  // Rulebook skills and declared skills share the project-local skills dirs. A directory name claimed by both
  // delivery namespaces would clobber, so reject the overlap before any write.
  defects.add(findCrossNamespaceCollisionDefects(desiredSkillDirs.values().toArray(), declaredSkillSet));

  // Because every delivery pass below targets this one set of harnesses, and each renders its content for the harness
  // to which it writes, the set is resolved once and threaded rather than re-derived per pass.
  const targets = await resolveTargetHarnesses({ harness: options.harness, cwd: domain.baseDir, homeDir });
  const harnessIds = targets.harnessIds;

  // Resolved before every render gate, so that the gates and the writes that they guard cannot disagree about where a
  // link target lands. The deployed skill dirs that it reads are settled above: `resolvedSkills` and
  // `desiredSkillDirs` name everything this run writes into a domain skills dir, and the collision gate has already
  // proven them disjoint.
  const resolveAnchorContext = createAnchorContextResolver(
    resolvedSkills,
    desiredSkillDirs.values().toArray(),
    domain.anchorBase,
  );
  const resolveRulebookContext = createRulebookContextResolver(resolved, resolveAnchorContext);

  // Rendered per harness, because a bound body contains that harness's link targets, sigils, and home dir. Built once
  // here so that the skill pass and the subagent pass splice the same guidance.
  const fillsByHarness = new Map(
    harnessIds.map((harnessId) => [
      harnessId,
      buildGuidanceHookFills(declaration.guidanceHooks, resolved, harnessId, resolveRulebookContext),
    ]),
  );

  const harnessSkillTargets = harnessIds.map((harnessId) =>
    resolveSkillTarget(harnessId, domain.baseDir, rulebookCatalog, fillsByHarness.get(harnessId)),
  );

  // Subagent delivery targets each harness's project-local subagents dir. Resolved separately from skills because the
  // transform is harness-specific, and subagents live in a distinct flat dir from skills.
  const declaredSubagentSet = new Set(resolvedSubagents.map((subagent) => subagent.slug));
  const harnessSubagentTargets = harnessIds.map((harnessId) =>
    resolveSubagentTarget(harnessId, domain.baseDir, rulebookCatalog, fillsByHarness.get(harnessId)),
  );

  // Memoized, so that the pre-write render gate and the write that follows it read one overlay per (harness, source)
  // rather than one per subagent.
  const resolveOverlay = createOverlayLoader();

  // Scanned against the pre-write filesystem, so that each delivery pass below can retract before it writes and free
  // a name for reuse within the same run. The two skill namespaces share these dirs and are scanned separately, each
  // reading only its own marker, so neither ever claims the other's.
  const skillOrphansByDir = await findRulebookSkillOrphans(harnessSkillTargets, desiredSkillDirs);
  const declaredSkillOrphansByDir = await findDeclaredSkillOrphans(harnessSkillTargets, resolvedSkills);
  const subagentOrphansByDir = await findSubagentOrphans(harnessSubagentTargets, declaredSubagentSet);

  // Before any write or delete, fail closed on any skill or subagent target that already exists without this sync's
  // ownership marker: an install-managed or hand-authored file. The marker-gated retraction scans keep such files
  // from being deleted; this keeps them from being overwritten. Runs in dry-run too, so that a preview reports the
  // conflict.
  defects.add(
    await findForeignOwnedTargetDefects(
      collectOwnedTargets(harnessSkillTargets, resolved, resolvedSkills, harnessSubagentTargets, resolvedSubagents),
    ),
  );

  // Render every declared skill against every targeted harness up front, so that a broken include or an unmapped tool
  // placeholder fails the whole run (dry-run included) before any file is written. The rendered output is discarded
  // here; `deploySkill` re-renders it at write time.
  defects.add(await findDeclaredSkillRenderDefects(harnessSkillTargets, resolvedSkills, resolveAnchorContext));

  // Same gate for each source's support entries, whose defects would otherwise appear only at the write below. The
  // rendered result is passed to the preview and the delivery pass rather than rendered again by each.
  const sourceSupport = await renderSourceSupportPlans(harnessSkillTargets, sources, resolveAnchorContext);
  const sourceSupportPlans = sourceSupport.plans;
  defects.add(sourceSupport.defects);

  // Same gate for subagents, whose deploy is the last write pass: Without it a render failure occurs after the
  // ambient host and every skill file are already on disk.
  defects.add(
    await findDeclaredSubagentRenderDefects(
      harnessSubagentTargets,
      resolvedSubagents,
      resolveAnchorContext,
      resolveOverlay,
    ),
  );

  // Same gate for rulebooks: A link target that the delivery pipeline cannot honor fails the run before either
  // delivery pass writes, rather than deploying a path that resolves to nothing.
  defects.add(findRulebookRenderDefects(harnessIds, resolved, resolveRulebookContext));

  // Reject a sync-owned ambient host whose region is half-written before anything is written, dry-run included.
  // Appending beside a stray marker is the one path in this command that can destroy hand-authored content.
  const ambientHosts = await probeAmbientHosts(harnessIds, domain);
  defects.add(findDamagedAmbientHostDefects(ambientHosts, domain, resolved));

  // Every gate above has reported. Raised here, ahead of `retireRetiredOutputs`, which is the first call in this
  // phase that writes, so a failing run leaves the previously deployed guidance exactly as it found it.
  if (defects.found.length > 0) {
    throw new SyncValidationError(defects.found);
  }

  // Attribute each deployed artifact to the source from which it resolved, flagging any that shadows a same-slug
  // library artifact. Built once, off the write path, and consumed by both the dry-run report and the real-run shadow
  // warning.
  const resolutionReport = await buildResolutionReport(resolver, resolved, resolvedSkills, resolvedSubagents);

  // Derived before the paths diverge, so that a dry run cannot describe an ambient host differently from the run that
  // it previews.
  const ambientHostPlans = planAmbientHosts(ambientHosts, domain, resolved, resolveRulebookContext);

  // Advisory only, and gathered for both paths: A dry run that would create the host warns about it too.
  const unignoredHosts =
    domain.ambient === 'project-local' ? await findUnignoredHosts(domain.baseDir, ambientHostPlans) : [];

  // Read after the render gates above, which leaves a malformed directive to fail from the gate that can name its
  // body and line rather than from this pass.
  const declaredHooks = await listDeclaredGuidanceHooks(resolvedSkills, resolvedSubagents, harnessIds);

  const retirements = await retireRetiredOutputs(options, domain);

  const plan: SyncPlan = {
    targets,
    droppedHarnesses: await planDroppedHarnessRetractions({
      targets,
      baseDir: domain.baseDir,
      ambient: domain.ambient,
    }),
    resolutionReport,
    ambientHosts: ambientHostPlans,
    unignoredHosts,
    retirements,
    resolved,
    harnessSkillTargets,
    skillOrphansByDir,
    resolvedSkills,
    declaredSkillOrphansByDir,
    resolvedSubagents,
    harnessSubagentTargets,
    subagentOrphansByDir,
    sourceSupportPlans,
    sourceSupportRetractions: await planSourceSupportRetractions(harnessSkillTargets, sourceSupportPlans),
    promptsYmlPaths: resolvePromptsYmlPaths(harnessIds, domain),
    missingSources,
    // Otherwise a consumer has to learn a third party's catalog by hand to discover there is anything to adopt. This
    // is advice, not action: Nothing is deployed until the project declares the package.
    undeclaredPackages: await findUndeclaredGuidancePackages(
      [...declaration.packages, ...declaration.declinedPackages],
      domain.baseDir,
    ),
    guidanceHookAdvisories: findGuidanceHookAdvisories(declaration.guidanceHooks, resolved, declaredHooks),
  };

  if (options.dryRun) {
    return { kind: 'reconciled', plan };
  }

  // First write of the run, so that a harness leaving the target set is cleared before anything is delivered to the
  // ones that remain. Its paths are disjoint from every targeted harness's, so the order does not affect the delivery
  // passes.
  await retractDroppedHarnesses(plan.droppedHarnesses);

  await deliverAmbient(ambientHostPlans);

  // Reconcile rulebook-delivered skill files per targeted harness, ahead of the declared-skill pass that shares
  // those dirs. The collision gate has already proven the two namespaces disjoint.
  await reconcileRulebookSkills(skillOrphansByDir, resolved, resolveRulebookContext);

  await reconcileDeclaredSkills(harnessSkillTargets, declaredSkillOrphansByDir, resolvedSkills, resolveAnchorContext);

  await reconcileSourceSupport(harnessSkillTargets, sourceSupportPlans);

  // Reconcile independently of the skill passes, whose dirs are disjoint from the subagents dir.
  await reconcileDeclaredSubagents(
    harnessSubagentTargets,
    subagentOrphansByDir,
    resolvedSubagents,
    resolveAnchorContext,
    resolveOverlay,
  );

  await refreshPromptsYml(harnessIds, domain);

  // Resolved once per declared source rather than once per deployed file, so that the report can test containment
  // lexically. A `workspace:*` source resolves through a `node_modules` symlink that names the repo maintaining it
  // nowhere, and its canonical directory does.
  const sourceRoots = await resolveCanonicalSourceRoots(sources, contentDir);

  // Last of all, so that the measurement reads the tree that every pass above left. Cannot fail: No size condition
  // may fail a sync.
  await recordDeployedSizes({
    plan,
    domain,
    homeDir,
    packageRoot: resolveRunningPackageRoot(),
    resolveSourceRoot: (source) => sourceRoots.get(source),
  });

  return { kind: 'reconciled', plan };
}

// region | Helpers

/**
 * Attributes each deployed rulebook, skill, and subagent to the source from which it resolved, flagging any
 * source-resolved artifact whose slug also exists in the library as shadowing it. The library probe runs only for
 * source-resolved artifacts (a library-resolved artifact cannot shadow the library) and is batched across all of them.
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

/**
 * Concatenates per-type seed sets into the one set that seeds closure resolution, leaving duplicates in: `resolveClosure`
 * dedupes by slug as it walks.
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

/** The directory with its symlinks resolved, or the path as given when it resolves to nothing, as a missing source does. */
async function resolveCanonicalDir(dir: string): Promise<string> {
  try {
    return await realpath(dir);
  } catch {
    return dir;
  }
}

/**
 * Maps each declared source's name, and `undefined` for the built-in library, to the canonical directory behind it.
 */
async function resolveCanonicalSourceRoots(
  sources: ReadonlyArray<DeclaredSource>,
  contentDir: string,
): Promise<ReadonlyMap<string | undefined, string>> {
  const roots: Array<{ name: string | undefined; dir: string }> = [{ name: undefined, dir: contentDir }, ...sources];
  return new Map(
    await Promise.all(roots.map(async (root) => [root.name, await resolveCanonicalDir(root.dir)] as const)),
  );
}

// endregion | Helpers

import path from 'node:path';

import { ARTIFACT_TYPES, type ArtifactType } from '../../lib/artifact-types.ts';
import { type ResolvedDeclaration, resolveDeclaration } from '../../lib/codeassembly-manifest.ts';
import { findShadowedSources, type SourceResolver } from '../../lib/content-sources.ts';
import { listDeclaredGuidanceHooks } from '../../lib/declared-guidance-hooks.ts';
import { resolveDeclaredReferences } from '../../lib/declared-references.ts';
import type { DeclaredSource } from '../../lib/declared-sources.ts';
import type { AgentsGit } from '../../lib/git.ts';
import { buildGuidanceHookFills } from '../../lib/guidance-hook-fills.ts';
import { buildRulebookInvocationCatalog } from '../../lib/invocation-tokens.ts';
import { listSupportEntries } from '../../lib/library-catalog.ts';
import type { ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import type { ResolveRulebookContext } from '../../lib/rulebook-transform.ts';
import type { ResolvedSkill } from '../../lib/skill-deploy.ts';
import type { ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import { type ResolvedHarnessTargets, resolveTargetHarnesses } from '../../lib/target-harnesses.ts';
import type { InstallOptions } from '../../lib/types.ts';
import {
  buildPlannedReferences,
  findUnignoredHosts,
  planAmbientHosts,
  type PlannedAmbientHost,
  probeAmbientHosts,
} from './ambient-hosts.ts';
import {
  buildDesiredRulebookSkillDirs,
  findDeclaredSkillOrphans,
  findRulebookSkillOrphans,
  findSubagentOrphans,
} from './owned-artifacts.ts';
import {
  collectOwnedTargets,
  createDefectCollector,
  findCrossNamespaceCollisionDefects,
  findDamagedAmbientHostDefects,
  findForeignOwnedTargetDefects,
} from './pre-write-gates.ts';
import {
  createAnchorContextResolver,
  createOverlayLoader,
  createRulebookContextResolver,
  type ResolveAnchorContext,
  type ResolveOverlay,
  resolveSkillTarget,
  resolveSubagentTarget,
} from './render-contexts.ts';
import {
  findDeclaredSkillRenderDefects,
  findDeclaredSubagentRenderDefects,
  findRulebookRenderDefects,
} from './render-gates.ts';
import { resolveDomainArtifacts } from './resolve-domain-artifacts.ts';
import { renderSourceSupportPlans } from './source-support.ts';
import type { SyncDomain } from './sync-domain.ts';
import type { ResolutionEntry, SyncOutcome, SyncPlan } from './sync-plan.ts';
import { SyncValidationError } from './sync-validation-error.ts';

/** What the pre-write phase settles: the resolved, gated artifacts and the renderers that the write phase reuses. */
export interface ResolvedDomain extends Pick<
  SyncPlan,
  | 'declaredSkillOrphansByDir'
  | 'harnessSkillTargets'
  | 'harnessSubagentTargets'
  | 'missingSources'
  | 'references'
  | 'resolutionReport'
  | 'resolved'
  | 'resolvedSkills'
  | 'resolvedSubagents'
  | 'sourceSupportPlans'
  | 'subagentOrphansByDir'
  | 'targets'
  | 'unignoredHosts'
> {
  readonly kind: 'resolved';
  readonly ambientHostPlans: ReadonlyArray<PlannedAmbientHost>;
  readonly declaration: ResolvedDeclaration;
  readonly declaredHooks: ReadonlySet<string>;
  readonly harnessIds: ResolvedHarnessTargets['harnessIds'];
  readonly resolveAnchorContext: ResolveAnchorContext;
  readonly resolveOverlay: ResolveOverlay;
  readonly resolveRulebookContext: ResolveRulebookContext;
  readonly skillOrphansByDir: Awaited<ReturnType<typeof findRulebookSkillOrphans>>;
  readonly sources: ReadonlyArray<DeclaredSource>;
}

/**
 * Resolves the `codeassembly.yaml` scope chain under `domain.baseDir`, resolves every declared artifact against the
 * declared sources, and runs every pre-write gate, returning what the write phase reads. Returns the no-declaration
 * outcome when the declaration is absent, and throws a `SyncValidationError` listing every defect that the gates found.
 * Writes nothing.
 */
export async function resolveDomain(
  options: InstallOptions,
  domain: SyncDomain,
  homeDir: string,
  git: AgentsGit,
): Promise<ResolvedDomain | Extract<SyncOutcome, { kind: 'no-declaration' }>> {
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

  // Because every gate in this phase reports into one collector rather than throwing, a run reports every defect that
  // it found instead of its first. The list is raised below, before the first call that writes.
  const defects = createDefectCollector();

  const { missingSources, resolved, resolvedSkills, resolvedSubagents, resolver, sources } =
    await resolveDomainArtifacts(declaration, domain, defects);

  const declaredSkillSet = new Set(resolvedSkills.map((skill) => skill.slug));

  // Rulebook skills and declared skills share the project-local skills dirs. A directory name claimed by both
  // delivery namespaces would clobber, so reject the overlap before any write.
  defects.add(
    findCrossNamespaceCollisionDefects(
      resolved.filter((rulebook) => rulebook.skill).map((rulebook) => rulebook.skillName),
      declaredSkillSet,
    ),
  );

  // Because every delivery pass in `reconcileDomain` targets this one set of harnesses, and each renders its content
  // for the harness to which it writes, the set is resolved once and threaded rather than re-derived per pass.
  const targets = await resolveTargetHarnesses({ harness: options.harness, cwd: domain.baseDir, homeDir });
  const harnessIds = targets.harnessIds;

  // Maps each harness to its skill-delivery rulebooks, each by stable slug to the directory in which its skill currently
  // belongs. Retraction compares this against what each owned directory's marker reports, so it retracts the old dir of
  // a renamed skill and the dir of a rulebook that no longer targets the harness.
  const desiredSkillDirs = buildDesiredRulebookSkillDirs(resolved, harnessIds);

  // Resolved before every render gate, so that the gates and the writes that they guard cannot disagree about where a
  // link target is deployed. The deployed skill dirs that it reads are settled above: `resolvedSkills` and
  // `desiredSkillDirs` name everything this run writes into a domain skills dir, and the collision gate has already
  // proven them disjoint.
  const resolveAnchorContext = createAnchorContextResolver(
    resolvedSkills,
    desiredSkillDirs,
    domain.anchorBase,
    await listSupportEntriesBySource(sources),
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

  // Every body that addresses a rulebook by token (rulebook, skill, and subagent alike) resolves it through the same
  // per-harness catalog, built from the one closure, so that two passes cannot disagree about what is addressable on a
  // harness. The closure already contains a rulebook named only by a skill's or subagent's token, since those tokens
  // are dependency edges.
  const harnessSkillTargets = harnessIds.map((harnessId) =>
    resolveSkillTarget(
      harnessId,
      domain.baseDir,
      buildRulebookInvocationCatalog(resolved, harnessId),
      fillsByHarness.get(harnessId),
    ),
  );

  // Subagent delivery targets each harness's project-local subagents dir. Resolved separately from skills because the
  // transform is harness-specific, and subagents live in a distinct flat dir from skills.
  const declaredSubagentSet = new Set(resolvedSubagents.map((subagent) => subagent.slug));
  const harnessSubagentTargets = harnessIds.map((harnessId) =>
    resolveSubagentTarget(
      harnessId,
      domain.baseDir,
      buildRulebookInvocationCatalog(resolved, harnessId),
      fillsByHarness.get(harnessId),
    ),
  );

  // Memoized, so that the pre-write render gate and the write that follows it read one overlay per (harness, source)
  // rather than one per subagent.
  const resolveOverlay = createOverlayLoader();

  // Scanned against the pre-write filesystem, so that each delivery pass in `reconcileDomain` can retract before it
  // writes and free a name for reuse within the same run. The two skill namespaces share these dirs and are scanned
  // separately, each reading only its own marker, so neither ever claims the other's.
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

  // Same gate for each source's support entries, whose defects would otherwise appear only at the write in
  // `reconcileDomain`. The rendered result is passed to the preview and the delivery pass rather than rendered again by
  // each.
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

  // A reference that does not resolve would deploy a pointer to nothing, so it fails the run like any other defect.
  const referenceResolution = await resolveDeclaredReferences(declaration.references);
  defects.add(referenceResolution.defects);
  const references = buildPlannedReferences(referenceResolution.resolved, domain, homeDir);

  // Reject a sync-owned ambient host whose region is half-written before anything is written, dry-run included.
  // Appending beside a stray marker is the one path in this command that can destroy hand-authored content.
  const ambientHosts = await probeAmbientHosts(harnessIds, domain);
  defects.add(findDamagedAmbientHostDefects(ambientHosts, domain, resolved, references));

  // Every gate above has reported. Raised here, ahead of `retireRetiredOutputs`, which is the first call in this
  // phase that writes, so a failing run leaves the previously deployed guidance exactly as it found it.
  if (defects.found.length > 0) {
    throw new SyncValidationError(defects.found);
  }

  // Attribute each deployed artifact to the source from which it resolved, naming any lower-precedence source that
  // also provides it. Built once, off the write path, and consumed by both the dry-run report and the real-run shadow
  // warning.
  const resolutionReport = await buildResolutionReport(resolver, resolved, resolvedSkills, resolvedSubagents);

  // Derived before the paths diverge, so that a dry run cannot describe an ambient host differently from the run that
  // it previews.
  const ambientHostPlans = planAmbientHosts(ambientHosts, domain, resolved, references, resolveRulebookContext);

  // Advisory only, and gathered for both paths: A dry run that would create the host warns about it too.
  const unignoredHosts =
    domain.ambient === 'project-local' ? await findUnignoredHosts(domain.baseDir, ambientHostPlans, git) : [];

  // Read after the render gates above, which leaves a malformed directive to fail from the gate that can name its
  // body and line rather than from this pass.
  const declaredHooks = await listDeclaredGuidanceHooks(resolvedSkills, resolvedSubagents, harnessIds);

  return {
    kind: 'resolved',
    ambientHostPlans,
    declaration,
    declaredHooks,
    declaredSkillOrphansByDir,
    harnessIds,
    harnessSkillTargets,
    harnessSubagentTargets,
    missingSources,
    references,
    resolutionReport,
    resolveAnchorContext,
    resolved,
    resolvedSkills,
    resolvedSubagents,
    resolveOverlay,
    resolveRulebookContext,
    skillOrphansByDir,
    sources,
    sourceSupportPlans,
    subagentOrphansByDir,
    targets,
    unignoredHosts,
  };
}

// region | Helpers

/**
 * Attributes each deployed rulebook, skill, and subagent to the source from which it resolved, naming the
 * lower-precedence sources that provide the same slug and that it therefore shadows.
 */
async function buildResolutionReport(
  resolver: SourceResolver,
  rulebooks: ReadonlyArray<ResolvedRulebook>,
  skills: ReadonlyArray<ResolvedSkill>,
  subagents: ReadonlyArray<ResolvedSubagent>,
): Promise<ReadonlyArray<ResolutionEntry>> {
  const artifacts: Array<{ type: ArtifactType; slug: string; source: string }> = Array.from(rulebooks, (rulebook) => ({
    type: 'rulebook',
    slug: rulebook.slug,
    source: rulebook.source,
  }));
  for (const skill of skills) {
    artifacts.push({ type: 'skill', slug: skill.slug, source: skill.source });
  }
  for (const subagent of subagents) {
    artifacts.push({ type: 'subagent', slug: subagent.slug, source: subagent.source });
  }
  return Promise.all(
    artifacts.map(async (artifact) => ({
      ...artifact,
      shadowedSources: await findShadowedSources(resolver, artifact.type, artifact.slug, artifact.source),
    })),
  );
}

/** Maps each declared source's name to the support entries that its `skills/` directory provides. */
async function listSupportEntriesBySource(
  sources: ReadonlyArray<DeclaredSource>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  return new Map(
    await Promise.all(
      sources.map(
        async (source) =>
          [
            source.name,
            new Set(await listSupportEntries(path.join(source.dir, ARTIFACT_TYPES.skill.contentPath))),
          ] as const,
      ),
    ),
  );
}

// endregion | Helpers

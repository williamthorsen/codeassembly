import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { type DeclaredSource, NoContentSourceError } from '../../lib/declared-sources.ts';
import { type AgentsGit, realGit } from '../../lib/git.ts';
import { recordFailedHomeAttempt, recordHomeProvenance } from '../../lib/home-provenance.ts';
import { assertDesignatedWriter } from '../../lib/home-writer-guard.ts';
import { findUndeclaredGuidancePackages } from '../../lib/package-sources.ts';
import { resolveRunningPackageRoot } from '../../lib/running-package.ts';
import type { InstallOptions } from '../../lib/types.ts';
import { deliverAmbient } from './ambient-hosts.ts';
import { reconcileDeclaredSkills, reconcileDeclaredSubagents, reconcileRulebookSkills } from './artifact-delivery.ts';
import { planDroppedHarnessRetractions, retractDroppedHarnesses } from './harness-retraction.ts';
import { findGuidanceHookAdvisories } from './hook-bindings.ts';
import { retireAmbientHost, type Retirement, retireRetiredOutputs } from './legacy-retirement.ts';
import { refreshPromptsYml, resolvePromptsYmlPaths } from './prompts-index.ts';
import { recordDeployedSizes } from './record-deployed-sizes.ts';
import { resolveDomain } from './resolve-domain.ts';
import { planSourceSupportRetractions, reconcileSourceSupport } from './source-support.ts';
import type { SyncDomain } from './sync-domain.ts';
import type { SyncOutcome, SyncPlan } from './sync-plan.ts';
import { describeSyncFailure } from './sync-validation-error.ts';

/**
 * Resolves a project's `codeassembly.yaml` scope chain and reconciles it into that project's harness dirs (the repo
 * domain). A thin wrapper over `reconcileDomain` that supplies the repo `SyncDomain`. An absent `codeassembly.yaml`
 * is a total no-op. The home directory decides targeting, through its declaration tier and the harnesses installed
 * under it.
 */
export async function syncCommand(
  options: InstallOptions,
  projectRoot: string = process.cwd(),
  homeDir: string = homedir(),
  git: AgentsGit = realGit,
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
    git,
  );
}

/**
 * Resolves the user-global `~/.agents/codeassembly.yaml` scope chain and reconciles it into the home harness dirs (the
 * home domain). A thin wrapper over `reconcileDomain` that supplies the home `SyncDomain`. Writes ambient blocks into
 * the ambient region of each targeted harness's guidance file (e.g. `~/.claude/CLAUDE.md`), which the harness loads
 * mechanically. It does not write any agent-read host file. When the home declaration is absent, changes nothing and
 * returns the outcome naming `init --global` as the remedy.
 */
export async function syncGlobalCommand(
  options: InstallOptions,
  homeDir: string = homedir(),
  git: AgentsGit = realGit,
): Promise<SyncOutcome> {
  // Runs first, and before the dry-run gate: A preview must refuse whenever the real run would.
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
      git,
    );
    retirement = await retireAmbientHost(options, path.join(homeDir, '.agents', 'GLOBAL.md'), true);
  } catch (error: unknown) {
    // Recorded past the designated-writer guard above, so an installation refused by the guard doesn't touch any home
    // state. A declaration without a usable source is refused the same way, before anything about the run is known.
    if (!options.dryRun && !(error instanceof NoContentSourceError)) {
      await recordFailedHomeAttempt('sync --global', describeSyncFailure(error), homeDir);
    }
    throw error;
  }

  if (!options.dryRun) {
    await recordHomeProvenance('sync --global', homeDir, git);
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
  git: AgentsGit,
): Promise<SyncOutcome> {
  const resolution = await resolveDomain(options, domain, homeDir, git);
  if (resolution.kind === 'no-declaration') {
    return resolution;
  }
  const {
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
  } = resolution;

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
    references,
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
      [...declaration.packages, ...declaration.declinedPackages, ...declaration.sourcePackages],
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
  // lexically. A `workspace:*` source resolves through a `node_modules` symlink; its canonical directory is the path
  // inside the repository that maintains it.
  const sourceRoots = await resolveCanonicalSourceRoots(sources);

  // Last of all, so that the measurement reads the tree that every pass above left. Cannot fail: A size condition
  // must not fail a sync.
  const sizes = await recordDeployedSizes({
    plan,
    domain,
    git,
    homeDir,
    packageRoot: resolveRunningPackageRoot(),
    resolveSourceRoot: (source) => sourceRoots.get(source),
  });

  return { kind: 'reconciled', plan, sizes };
}

// region | Helpers

/** The directory with its symlinks resolved, or the path as given when it cannot be resolved, as a missing source cannot. */
async function resolveCanonicalDir(dir: string): Promise<string> {
  try {
    return await realpath(dir);
  } catch {
    return dir;
  }
}

/** Maps each declared source's name to the canonical directory behind it. */
async function resolveCanonicalSourceRoots(
  sources: ReadonlyArray<DeclaredSource>,
): Promise<ReadonlyMap<string, string>> {
  return new Map(
    await Promise.all(sources.map(async (source) => [source.name, await resolveCanonicalDir(source.dir)] as const)),
  );
}

// endregion | Helpers

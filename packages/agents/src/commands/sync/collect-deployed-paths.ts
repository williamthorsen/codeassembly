import { existsSync } from 'node:fs';
import path from 'node:path';

import type { DeployedFileKind } from '../../deployed-sizes/types.ts';
import { readDirEntriesRecursively } from '../../lib/fs-helpers.ts';
import { resolveHarnessPaths } from '../../lib/harness.ts';
import { SOURCE_SUPPORT_DIR } from '../../lib/link-anchor.ts';
import { getManifestPath, readManifest } from '../../lib/manifest.ts';
import { type ResolvedSkill, skillTargetsHarness } from '../../lib/skill-deploy.ts';
import type { HarnessId } from '../../lib/types.ts';
import type { SyncDomain } from './sync-domain.ts';

/** Sentinel hash under which the install manifest records a directory rather than a file. */
const DIRECTORY_HASH_PREFIX = 'sha256:dir:';

/** Filename of a deployed skill's body, at the root of the directory under which the skill deploys. */
const SKILL_FILENAME = 'SKILL.md';

/**
 * What a deployed file is to a harness. `skill` and `subagent` mark the two files whose `description` a harness reads
 * into every session's listing; `other` covers everything a harness reads only once something opens it.
 */
export type DeployedFileRole = 'other' | 'skill' | 'subagent';

/** One deployed file: where it is, the key under which it is recorded, and whether a harness loads it into context. */
export interface DeployedPath {
  /**
   * Deployed path relative to the harness home, or to the domain base for a file deployed outside it, prefixed by
   * the harness that loads it.
   */
  readonly key: string;
  readonly absPath: string;
  readonly kind: DeployedFileKind;
  readonly role: DeployedFileRole;
  readonly harnessId: HarnessId;
}

/**
 * The parts of a sync plan that name what a deployment wrote. Declared as the fields that collection reads rather
 * than as the whole plan, so that the signature states its inputs and a test constructs them.
 */
export interface DeployedPathSources {
  readonly ambientHosts: ReadonlyArray<{ readonly hostPath: string }>;
  readonly harnessSkillTargets: ReadonlyArray<{ readonly harnessId: HarnessId; readonly skillsDir: string }>;
  readonly harnessSubagentTargets: ReadonlyArray<{ readonly harnessId: HarnessId; readonly subagentsDir: string }>;
  readonly resolved: ReadonlyArray<{ readonly skill: boolean; readonly skillName: string }>;
  readonly resolvedSkills: ReadonlyArray<ResolvedSkill>;
  readonly resolvedSubagents: ReadonlyArray<{ readonly slug: string }>;
  readonly sourceSupportPlans: ReadonlyArray<{
    readonly sourcesRoot: string;
    readonly destDir: string;
    readonly entries: ReadonlyArray<{ readonly relPath: string }>;
    readonly kind: 'deliver' | 'retract' | 'none';
  }>;
  readonly targets: { readonly harnessIds: ReadonlyArray<HarnessId> };
}

/** One deployment's measurable surface: the files it wrote, and the guidance files whose ambient region it fills. */
export interface DeployedPathSet {
  readonly files: ReadonlyArray<DeployedPath>;
  /** Guidance files hosting an ambient region, measured by that region rather than by their whole bytes. */
  readonly ambientHostPaths: ReadonlyArray<string>;
}

/**
 * Collects the set of deployed files to measure, from the sync plan and, in the home domain, from the install
 * manifest. Membership comes from what the two commands recorded writing rather than from a walk of the harness tree,
 * which holds far more than CodeAssembly deploys.
 *
 * A skill deploys as a directory, so the entries inside each directory that the plan names are read. That walk is
 * bounded by the directories that the plan already owns, which leaves a plugin skill and a hand-authored one
 * unreachable from it.
 *
 * The install manifest contributes in the home domain alone, since `install` resolves its paths under the home
 * directory and the CLI passes no other base. A repo-domain collection reads the plan alone, whose
 * `sourceSupportPlans` cover that domain's `skills/_data/`.
 */
export async function collectDeployedPaths(
  plan: DeployedPathSources,
  domain: SyncDomain,
  homeDir: string,
): Promise<DeployedPathSet> {
  const base = domain.ambient === 'harness-home' ? homeDir : domain.baseDir;
  const collected = new Map<string, DeployedPath>();

  const rulebookSkillDirs = plan.resolved.filter((rulebook) => rulebook.skill).map((rulebook) => rulebook.skillName);
  for (const target of plan.harnessSkillTargets) {
    const { harnessId, skillsDir } = target;
    const skillDirs = [
      ...plan.resolvedSkills.filter((skill) => skillTargetsHarness(skill, harnessId)).map((skill) => skill.slug),
      ...rulebookSkillDirs,
    ];
    for (const dir of skillDirs) {
      await collectDirectory(collected, path.join(skillsDir, dir), harnessId, base, true);
    }
    // Delivered support entries are named file by file, so they are read from the plan rather than walked.
    const sourcesRoot = path.join(skillsDir, SOURCE_SUPPORT_DIR);
    for (const supportPlan of plan.sourceSupportPlans) {
      if (supportPlan.kind !== 'deliver' || supportPlan.sourcesRoot !== sourcesRoot) {
        continue;
      }
      for (const entry of supportPlan.entries) {
        addPath(collected, path.join(supportPlan.destDir, ...entry.relPath.split('/')), harnessId, base);
      }
    }
  }

  for (const target of plan.harnessSubagentTargets) {
    for (const subagent of plan.resolvedSubagents) {
      addPath(collected, path.join(target.subagentsDir, `${subagent.slug}.md`), target.harnessId, base, 'subagent');
    }
  }

  if (domain.ambient === 'harness-home') {
    await collectManifestPaths(collected, plan.targets.harnessIds, homeDir);
  }

  return {
    files: collected.values().toArray(),
    ambientHostPaths: plan.ambientHosts.map((host) => host.hostPath),
  };
}

// region | Helpers

/**
 * Records one deployed file under its absolute path, dropping one already collected: The skill walk and the install
 * manifest can name one file twice, and a size vector counts each file once.
 */
function addPath(
  collected: Map<string, DeployedPath>,
  absPath: string,
  harnessId: HarnessId,
  base: string,
  role: DeployedFileRole = 'other',
): void {
  if (collected.has(absPath)) {
    return;
  }
  collected.set(absPath, {
    key: resolveKey(absPath, harnessId, base),
    absPath,
    kind: classifyFile(absPath),
    role,
    harnessId,
  });
}

/**
 * Classifies a deployed file by extension: `.md` is a document, everything else an asset. The question is whether a
 * harness loads the file into context, which follows from the file's role rather than from what it contains.
 */
function classifyFile(absPath: string): DeployedFileKind {
  return path.extname(absPath).toLowerCase() === '.md' ? 'document' : 'asset';
}

/**
 * Records every file inside one deployed directory, at every depth. An absent directory contributes nothing.
 *
 * `skillRoot` marks the directory as a deployed skill, whose `SKILL.md` carries the description that a harness lists;
 * a directory walked from the install manifest names no skill and passes it as false.
 */
async function collectDirectory(
  collected: Map<string, DeployedPath>,
  dir: string,
  harnessId: HarnessId,
  base: string,
  skillRoot: boolean,
): Promise<void> {
  const entries = await readDirEntriesRecursively(dir);
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const isSkillBody = skillRoot && entry.parentPath === dir && entry.name === SKILL_FILENAME;
    addPath(collected, path.join(entry.parentPath, entry.name), harnessId, base, isSkillBody ? 'skill' : 'other');
  }
}

/**
 * Records what `install` deployed into each targeted harness, reading the manifest's entries rather than the tree.
 * A directory entry is walked to its files. An entry naming a file that a later command removed contributes nothing,
 * which keeps a manifest left stale by an uninstall from failing the measurement that follows.
 */
async function collectManifestPaths(
  collected: Map<string, DeployedPath>,
  harnessIds: ReadonlyArray<HarnessId>,
  homeDir: string,
): Promise<void> {
  const manifest = await readManifest(getManifestPath(homeDir));
  for (const harnessId of harnessIds) {
    const { harnessHome } = resolveHarnessPaths(harnessId, homeDir);
    const entries = manifest.harnesses[harnessId]?.entries ?? [];
    for (const entry of entries) {
      const absPath = path.join(harnessHome, entry.relativePath);
      if (entry.contentHash.startsWith(DIRECTORY_HASH_PREFIX)) {
        await collectDirectory(collected, absPath, harnessId, homeDir, false);
        continue;
      }
      if (existsSync(absPath)) {
        addPath(collected, absPath, harnessId, homeDir);
      }
    }
  }
}

/**
 * Resolves the key under which a deployed file is recorded. The harness prefix is what keeps two harnesses' copies of
 * one skill distinct, which a bare deployed path would merge.
 */
function resolveKey(absPath: string, harnessId: HarnessId, base: string): string {
  const { harnessHome } = resolveHarnessPaths(harnessId, base);
  const relative = path.relative(harnessHome, absPath);
  const scoped = relative.startsWith('..') ? path.relative(base, absPath) : relative;
  return `${harnessId}/${scoped.split(path.sep).join('/')}`;
}

// endregion | Helpers

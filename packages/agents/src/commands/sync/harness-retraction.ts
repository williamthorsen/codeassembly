import { rm } from 'node:fs/promises';
import path from 'node:path';

import { removeAmbientRegion, stripAmbientRegionContent } from '../../lib/ambient-region.ts';
import { readFileOrEmpty, writeIfChanged } from '../../lib/fs-helpers.ts';
import { ALL_HARNESS_IDS, resolveAmbientHostPath, resolveHarnessPaths } from '../../lib/harness.ts';
import { SOURCE_SUPPORT_DIR } from '../../lib/link-anchor.ts';
import { hasPromptsRegion, removePromptsRegion } from '../../lib/prompts-yml-region.ts';
import { listUndeclaredSourceSupport } from '../../lib/support-deploy.ts';
import type { ResolvedHarnessTargets } from '../../lib/target-harnesses.ts';
import type { AmbientHostKind, HarnessId } from '../../lib/types.ts';
import { listOwnedDeclaredSkills, listOwnedSkills, listOwnedSubagents } from './owned-artifacts.ts';

/**
 * Everything one dropped harness still holds from a previous sync, as the absolute paths a real run removes and the
 * host rewrites it performs. Deriving the whole set before any write is what lets `--dry-run` report the sweep in the
 * same terms the run carries out.
 */
export interface DroppedHarnessRetraction {
  readonly harnessId: HarnessId;
  /** Owned dirs across both skill namespaces: rulebook-delivered and declared. */
  readonly skillDirs: ReadonlyArray<string>;
  readonly subagentFiles: ReadonlyArray<string>;
  /** Paths under the harness's support root that no source claims, which for a dropped harness is the root itself. */
  readonly supportPaths: ReadonlyArray<string>;
  readonly ambientHost: HostRetraction | undefined;
  readonly promptsYml: HostRetraction | undefined;
}

/** What retraction does to one host file that carries a sync-owned region: rewrite it, or delete it outright. */
export type HostRetraction =
  | { readonly kind: 'delete'; readonly path: string }
  | { readonly kind: 'rewrite'; readonly path: string; readonly content: string };

/**
 * Lists what each harness dropped from the `harnesses` declaration still holds under `baseDir`, one entry per harness
 * holding anything. Every path it names is gated on a sync provenance marker or a well-formed sync-owned region, so
 * an install-managed or hand-authored file is never claimed.
 *
 * Retraction follows the declaration alone, matching `install`'s pass. Under `flag`, `--harness claude` names the
 * run's target rather than declaring rovo unwanted; under `detection`, a harness detection misses has no directory
 * holding stale files. Either origin yields an empty result.
 *
 * The candidate set is every known harness minus the targeted ones, unfiltered by directory existence: each scan
 * answers an absent directory with nothing, and a harness holding nothing is left out of the result, so the report
 * never announces one that had no residue.
 */
export async function planDroppedHarnessRetractions(options: {
  readonly targets: ResolvedHarnessTargets;
  readonly baseDir: string;
  readonly ambient: AmbientHostKind;
}): Promise<ReadonlyArray<DroppedHarnessRetraction>> {
  if (options.targets.origin !== 'declaration') {
    return [];
  }

  const targeted = new Set(options.targets.harnessIds);
  const retractions: Array<DroppedHarnessRetraction> = [];

  for (const harnessId of ALL_HARNESS_IDS) {
    if (targeted.has(harnessId)) {
      continue;
    }
    const { harnessHome, skillsDir, subagentsDir } = resolveHarnessPaths(harnessId, options.baseDir);
    const retraction: DroppedHarnessRetraction = {
      harnessId,
      skillDirs: [
        ...(await listOwnedSkills(skillsDir)).map(({ dir }) => path.join(skillsDir, dir)),
        ...(await listOwnedDeclaredSkills(skillsDir)).map(({ dir }) => path.join(skillsDir, dir)),
      ],
      subagentFiles: (await listOwnedSubagents(subagentsDir)).map(({ file }) => path.join(subagentsDir, file)),
      // A dropped harness keeps no source, so nothing under the root survives and the listing collapses to the root.
      supportPaths: await listUndeclaredSourceSupport(path.join(skillsDir, SOURCE_SUPPORT_DIR), {
        surviving: [],
        emptied: [],
      }),
      ambientHost: await planAmbientRetraction(harnessId, options.baseDir, options.ambient),
      promptsYml: harnessId === 'rovo' ? await planPromptsRetraction(path.join(harnessHome, 'prompts.yml')) : undefined,
    };
    if (hasResidue(retraction)) {
      retractions.push(retraction);
    }
  }

  return retractions;
}

/** Carries out each dropped harness's plan, in the order the plan lists its surfaces. */
export async function retractDroppedHarnesses(retractions: ReadonlyArray<DroppedHarnessRetraction>): Promise<void> {
  for (const retraction of retractions) {
    for (const skillDir of retraction.skillDirs) {
      await rm(skillDir, { recursive: true, force: true });
    }
    for (const subagentFile of retraction.subagentFiles) {
      await rm(subagentFile, { force: true });
    }
    for (const supportPath of retraction.supportPaths) {
      await rm(supportPath, { recursive: true, force: true });
    }
    await applyHostRetraction(retraction.ambientHost);
    await applyHostRetraction(retraction.promptsYml);
  }
}

// region | Helpers

/** Writes or deletes one host per its retraction; an absent retraction is a no-op. */
async function applyHostRetraction(retraction: HostRetraction | undefined): Promise<void> {
  if (retraction === undefined) {
    return;
  }
  await (retraction.kind === 'delete'
    ? rm(retraction.path, { force: true })
    : writeIfChanged(retraction.path, retraction.content));
}

/** Whether a harness holds anything a sweep would remove, which is what keeps an untouched harness out of the report. */
function hasResidue(retraction: DroppedHarnessRetraction): boolean {
  return (
    retraction.skillDirs.length > 0 ||
    retraction.subagentFiles.length > 0 ||
    retraction.supportPaths.length > 0 ||
    retraction.ambientHost !== undefined ||
    retraction.promptsYml !== undefined
  );
}

/**
 * Decides what retraction does to one dropped harness's ambient host. The two hosts differ in who owns the region's
 * placement: `install` renders the harness-home region, so sync empties the content it owns and leaves the markers,
 * while the project-local host is sync's own and goes entirely, taking the file with it once nothing else remains.
 * A host carrying no well-formed region is left alone, so a damaged one stays the developer's to repair.
 */
async function planAmbientRetraction(
  harnessId: HarnessId,
  baseDir: string,
  ambient: AmbientHostKind,
): Promise<HostRetraction | undefined> {
  const hostPath = resolveAmbientHostPath(harnessId, ambient, baseDir);
  const content = await readFileOrEmpty(hostPath);
  const retracted = ambient === 'harness-home' ? stripAmbientRegionContent(content) : removeAmbientRegion(content);
  if (retracted === content) {
    return undefined;
  }
  return retracted.trim() === ''
    ? { kind: 'delete', path: hostPath }
    : { kind: 'rewrite', path: hostPath, content: retracted };
}

/**
 * Decides what retraction does to one dropped harness's `prompts.yml`. The codeassembly region is removed rather than
 * re-indexed: retraction withdraws sync's ownership of the file, where re-indexing would keep a region alive to list
 * whatever hand-authored skills the dir still holds. A file carrying no region was never sync's and is left alone.
 */
async function planPromptsRetraction(promptsPath: string): Promise<HostRetraction | undefined> {
  const content = await readFileOrEmpty(promptsPath);
  if (!hasPromptsRegion(content)) {
    return undefined;
  }
  const stripped = removePromptsRegion(content);
  return stripped.trim() === ''
    ? { kind: 'delete', path: promptsPath }
    : { kind: 'rewrite', path: promptsPath, content: stripped };
}

// endregion | Helpers

import { existsSync } from 'node:fs';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { type ContentDefect, foldHarnessDefects, type HarnessDefect } from '../../lib/content-defects.ts';
import { createSkillLinkAnchor, SOURCE_SUPPORT_DIR } from '../../lib/link-anchor.ts';
import type { RenderedSkillEntry } from '../../lib/skill-transform.ts';
import {
  deploySourceSupport,
  listUndeclaredSourceSupport,
  renderSourceSupport,
  retractUndeclaredSourceSupport,
  type SourceSupportOutcome,
} from '../../lib/support-deploy.ts';
import type { HarnessSkillTarget, ResolveAnchorContext } from './render-contexts.ts';

/**
 * Lists the namespace paths a real run would retract, one per targeted harness's support root, judged against the tree
 * delivery leaves rather than the one on disk. The plans name both halves of that: which namespaces gain content and
 * which delivery empties.
 */
export async function planSourceSupportRetractions(
  targets: ReadonlyArray<HarnessSkillTarget>,
  plans: ReadonlyArray<SourceSupportPlan>,
): Promise<ReadonlyArray<string>> {
  const retractions: Array<string> = [];
  for (const sourcesRoot of resolveSupportRoots(targets)) {
    retractions.push(...(await listUndeclaredSourceSupport(sourcesRoot, resolveSupportOutcome(plans, sourcesRoot))));
  }
  return retractions;
}

/**
 * Delivers each source's skill support entries into that source's namespace under every targeted harness's skills dir,
 * then retracts the namespaces no declared source claims. Delivery runs first so a source that dropped its last
 * support entry leaves an empty namespace root for the retraction to retire in the same pass.
 */
export async function reconcileSourceSupport(
  targets: ReadonlyArray<HarnessSkillTarget>,
  plans: ReadonlyArray<SourceSupportPlan>,
): Promise<void> {
  for (const plan of plans) {
    await deploySourceSupport(plan.destDir, plan.entries);
  }
  // Rooted in the targets rather than the plans: a run that declares no source has no plans, and its support roots
  // are exactly the ones whose every namespace is now undeclared.
  for (const sourcesRoot of resolveSupportRoots(targets)) {
    await retractUndeclaredSourceSupport(sourcesRoot, resolveSupportOutcome(plans, sourcesRoot));
  }
}

/**
 * Renders every source's support entries for every targeted harness, pairing each result with where it deploys.
 *
 * Rendering is where a defect in a package's reference content surfaces, so calling this ahead of every write is what
 * fails the run — dry-run included — before anything lands. The gate, the dry-run preview, and the delivery pass all
 * read this one result, which is what keeps them from disagreeing about what a source ships and from rendering the
 * same content more than once.
 */
export async function renderSourceSupportPlans(
  targets: ReadonlyArray<HarnessSkillTarget>,
  sources: ReadonlyArray<{ name: string; dir: string }>,
  resolveAnchorContext: ResolveAnchorContext,
): Promise<{ plans: ReadonlyArray<SourceSupportPlan>; defects: ReadonlyArray<ContentDefect> }> {
  const plans: Array<SourceSupportPlan> = [];
  const raised: Array<HarnessDefect> = [];
  for (const target of targets) {
    const sourcesRoot = path.join(target.skillsDir, SOURCE_SUPPORT_DIR);
    for (const source of sources) {
      const destDir = path.join(sourcesRoot, source.name);
      let entries: ReadonlyArray<RenderedSkillEntry>;
      try {
        entries = await renderSourceSupport(source.dir, {
          ...target.deployContext,
          anchor: createSkillLinkAnchor(resolveAnchorContext(target.harnessId, source.name)),
        });
      } catch (error: unknown) {
        raised.push({
          harnessId: target.harnessId,
          defect: { file: path.join(source.dir, SOURCE_SUPPORT_DIR), kind: 'render', detail: describeError(error) },
        });
        continue;
      }
      plans.push({
        sourcesRoot,
        name: source.name,
        destDir,
        entries,
        kind: resolveSupportVerdict(entries.length > 0, existsSync(destDir)),
      });
    }
  }
  return {
    plans,
    defects: foldHarnessDefects(
      raised,
      targets.map((target) => target.harnessId),
    ),
  };
}

/**
 * One source's support entries rendered for one harness, paired with the namespace directory they deploy into and
 * what delivery will do there: Write the entries, remove a namespace the source no longer fills, or nothing at all.
 * Carrying the verdict is what lets the preview describe the removals without re-deriving them from the tree that
 * delivery is about to change.
 */
export interface SourceSupportPlan {
  readonly sourcesRoot: string;
  readonly name: string;
  readonly destDir: string;
  readonly entries: ReadonlyArray<RenderedSkillEntry>;
  readonly kind: 'deliver' | 'retract' | 'none';
}

// region | Helpers

/** Groups one support root's plans into what delivery leaves there: the namespaces that hold content, and the rest. */
function resolveSupportOutcome(plans: ReadonlyArray<SourceSupportPlan>, sourcesRoot: string): SourceSupportOutcome {
  const rooted = plans.filter((plan) => plan.sourcesRoot === sourcesRoot);
  return {
    surviving: rooted.filter((plan) => plan.kind === 'deliver').map((plan) => plan.name),
    emptied: rooted.filter((plan) => plan.kind !== 'deliver').map((plan) => plan.name),
  };
}

/** Lists the support root each targeted harness keeps its per-source namespaces under. */
function resolveSupportRoots(targets: ReadonlyArray<HarnessSkillTarget>): ReadonlyArray<string> {
  return targets.map((target) => path.join(target.skillsDir, SOURCE_SUPPORT_DIR));
}

/** Names what delivery does at a namespace directory, given whether its source ships content and whether it exists. */
function resolveSupportVerdict(shipsContent: boolean, destExists: boolean): SourceSupportPlan['kind'] {
  if (shipsContent) {
    return 'deliver';
  }
  return destExists ? 'retract' : 'none';
}

// endregion | Helpers

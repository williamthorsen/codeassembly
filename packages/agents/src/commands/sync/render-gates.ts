import { describeError } from '@williamthorsen/toolbelt.errors';

import { artifactFrontmatterPath, type ArtifactType } from '../../lib/artifact-types.ts';
import { type ContentDefect, foldHarnessDefects, type HarnessDefect } from '../../lib/content-defects.ts';
import { artifactTargetsHarness } from '../../lib/harness.ts';
import { createContentRootLinkAnchor, createSkillLinkAnchor } from '../../lib/link-anchor.ts';
import type { ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import { renderRulebookBody, type ResolveRulebookContext } from '../../lib/rulebook-transform.ts';
import type { ResolvedSkill } from '../../lib/skill-deploy.ts';
import { renderSkillDirectory } from '../../lib/skill-transform.ts';
import { renderSubagent, type ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import type { HarnessId } from '../../lib/types.ts';
import type {
  HarnessSkillTarget,
  HarnessSubagentTarget,
  ResolveAnchorContext,
  ResolveOverlay,
} from './render-contexts.ts';

/**
 * Renders every declared skill against every targeted harness, discarding the output, so that a broken include or an
 * unmapped tool placeholder is reported before any file is written. The deploy pass re-renders at write time; this
 * pass exists only to fail the run closed, including under `--dry-run`.
 */
export async function findDeclaredSkillRenderDefects(
  targets: ReadonlyArray<HarnessSkillTarget>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  resolveAnchorContext: ResolveAnchorContext,
): Promise<ReadonlyArray<ContentDefect>> {
  const raised: Array<HarnessDefect> = [];
  for (const target of targets) {
    for (const skill of resolvedSkills) {
      if (!artifactTargetsHarness(skill, target.harnessId)) {
        continue;
      }
      try {
        await renderSkillDirectory(skill.srcDir, skill.slug, skill.contentRoot, {
          ...target.deployContext,
          anchor: createSkillLinkAnchor(resolveAnchorContext(target.harnessId, skill.source)),
        });
      } catch (error: unknown) {
        raised.push(describeRenderDefect('skill', skill.slug, target.harnessId, error));
      }
    }
  }
  return foldHarnessDefects(
    raised,
    targets.map((target) => target.harnessId),
  );
}

/**
 * Renders every declared subagent against every targeted harness, discarding the output, so that an unmapped tool
 * placeholder or a rulebook token is reported before any file is written. `reconcileDeclaredSubagents` re-renders at write
 * time; this pass exists only to fail the run closed, including under `--dry-run`.
 */
export async function findDeclaredSubagentRenderDefects(
  targets: ReadonlyArray<HarnessSubagentTarget>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
  resolveAnchorContext: ResolveAnchorContext,
  resolveOverlay: ResolveOverlay,
): Promise<ReadonlyArray<ContentDefect>> {
  const raised: Array<HarnessDefect> = [];
  for (const target of targets) {
    for (const subagent of resolvedSubagents) {
      try {
        await renderSubagent(subagent, {
          ...target.deployContext,
          anchor: createContentRootLinkAnchor(resolveAnchorContext(target.harnessId, subagent.source)),
          overlayYaml: await resolveOverlay(target.harnessId, subagent.contentRoot),
        });
      } catch (error: unknown) {
        raised.push(describeRenderDefect('subagent', subagent.slug, target.harnessId, error));
      }
    }
  }
  return foldHarnessDefects(
    raised,
    targets.map((target) => target.harnessId),
  );
}

/**
 * Renders every resolved rulebook against each targeted harness that the rulebook targets, discarding the output, so
 * that a link target that the delivery pipeline cannot honor is reported before any file is written. Both delivery
 * passes re-render at write time; this pass exists only to fail the run closed, including under `--dry-run`.
 */
export function findRulebookRenderDefects(
  harnessIds: ReadonlyArray<HarnessId>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolveRulebookContext: ResolveRulebookContext,
): ReadonlyArray<ContentDefect> {
  const raised: Array<HarnessDefect> = [];
  for (const harnessId of harnessIds) {
    for (const rulebook of resolved) {
      if (!artifactTargetsHarness(rulebook, harnessId)) {
        continue;
      }
      try {
        renderRulebookBody(rulebook.body, rulebook.slug, resolveRulebookContext(harnessId, rulebook.source));
      } catch (error: unknown) {
        raised.push(describeRenderDefect('rulebook', rulebook.slug, harnessId, error));
      }
    }
  }
  return foldHarnessDefects(raised, harnessIds);
}

// region | Helpers

/**
 * Builds one artifact's render defect, including the harness so that the fold can tell a body-local failure from a
 * scoped one.
 */
function describeRenderDefect(type: ArtifactType, slug: string, harnessId: HarnessId, error: unknown): HarnessDefect {
  return {
    harnessId,
    defect: { file: artifactFrontmatterPath(type, slug), kind: 'render', detail: describeError(error) },
  };
}

// endregion | Helpers

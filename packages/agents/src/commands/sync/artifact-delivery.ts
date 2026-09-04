import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { writeIfChanged } from '../../lib/fs-helpers.ts';
import { createContentRootLinkAnchor, createSkillLinkAnchor } from '../../lib/link-anchor.ts';
import type { ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import { renderSkillFile } from '../../lib/rulebook-skill.ts';
import { renderRulebookBody } from '../../lib/rulebook-transform.ts';
import { deploySkill, type ResolvedSkill, skillTargetsHarness } from '../../lib/skill-deploy.ts';
import { deploySubagent, type ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import type { HarnessId } from '../../lib/types.ts';
import type {
  HarnessSkillTarget,
  HarnessSubagentTarget,
  ResolveAnchorContext,
  ResolveOverlay,
  ResolveRulebookContext,
} from './render-contexts.ts';

/**
 * Retracts owned declared-skill dirs no longer declared, then deploys each declared skill into every targeted harness's
 * skills dir with that harness's transform applied. Orphans were computed against the pre-write filesystem, so
 * retracting before writing lets a slug freed in one dir be re-created in the same sync rather than clobbered.
 */
export async function reconcileDeclaredSkills(
  targets: ReadonlyArray<HarnessSkillTarget>,
  orphansByDir: ReadonlyArray<{ skillsDir: string; orphans: ReadonlyArray<string> }>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  resolveAnchorContext: ResolveAnchorContext,
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
      await deploySkill(skill, path.join(target.skillsDir, skill.slug), {
        ...target.deployContext,
        anchor: createSkillLinkAnchor(resolveAnchorContext(target.harnessId, skill.source)),
      });
    }
  }
}

/**
 * Retracts owned subagent files no longer declared, then deploys each declared subagent into every targeted harness's
 * subagents dir. Orphans were computed against the pre-write filesystem, so retracting before writing lets a slug
 * freed in one dir be re-created in the same sync rather than clobbered by a later retract.
 */
export async function reconcileDeclaredSubagents(
  targets: ReadonlyArray<HarnessSubagentTarget>,
  orphansByDir: ReadonlyArray<{ subagentsDir: string; orphans: ReadonlyArray<string> }>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
  resolveAnchorContext: ResolveAnchorContext,
  resolveOverlay: ResolveOverlay,
): Promise<void> {
  for (const target of targets) {
    const orphans = orphansByDir.find((entry) => entry.subagentsDir === target.subagentsDir)?.orphans ?? [];
    for (const file of orphans) {
      await rm(path.join(target.subagentsDir, file), { force: true });
    }
    for (const subagent of resolvedSubagents) {
      await deploySubagent(subagent, path.join(target.subagentsDir, `${subagent.slug}.md`), {
        ...target.deployContext,
        anchor: createContentRootLinkAnchor(resolveAnchorContext(target.harnessId, subagent.source)),
        overlayYaml: await resolveOverlay(target.harnessId, subagent.contentRoot),
      });
    }
  }
}

/**
 * Retracts sync-owned skill dirs that are no longer current, then writes every skill-delivery rulebook into each
 * targeted harness's skills dir. Orphans were computed against the pre-write filesystem, so retracting before writing
 * lets a skill name freed by one rulebook be recreated for another in the same sync, instead of the write being
 * clobbered by a later retract.
 */
export async function reconcileRulebookSkills(
  orphansByDir: ReadonlyArray<{ harnessId: HarnessId; skillsDir: string; orphans: ReadonlyArray<string> }>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolveRulebookContext: ResolveRulebookContext,
): Promise<void> {
  for (const { harnessId, skillsDir, orphans } of orphansByDir) {
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
        renderSkillFile({
          body: renderRulebookBody(rulebook.body, rulebook.slug, resolveRulebookContext(harnessId, rulebook.source)),
          description: rulebook.description,
          skillName: rulebook.skillName,
          slug: rulebook.slug,
          version: rulebook.version,
        }),
      );
    }
  }
}

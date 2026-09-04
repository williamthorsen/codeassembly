import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { expandIncludes } from './directive-expander.ts';
import { listGuidanceHooks } from './guidance-hooks.ts';
import { type ResolvedSkill, skillTargetsHarness } from './skill-deploy.ts';
import { isSkippedSkillEntry } from './skill-transform.ts';
import type { ResolvedSubagent } from './subagent-deploy.ts';
import type { HarnessId } from './types.ts';

/**
 * Collects every guidance hook the run's deployed bodies declare. A hook missing from the set is one that no body
 * declares, which is what makes a binding naming it recognizable as unreached.
 *
 * A skill declares through any Markdown file its deploy walk reaches, not the entry body alone, because every one of
 * them is filled: `renderSkillDirectory` recurses to each depth and renders each `.md` through the fill. The walk here
 * shares that one's skip rule, so the two cannot come to disagree about what a skill ships. A `skills/_data/` support
 * entry stays outside both, since the support route renders with its fills dropped.
 *
 * Bodies are include-expanded first, so a directive a partial carries counts for every body inlining it, the same
 * reason `resolveRulebook` expands before its own hook checks.
 *
 * Skills are narrowed to those targeting a harness this run deploys to, since one deployed nowhere reaches no agent.
 * Subagents deploy to every targeted harness and need no such filter.
 */
export async function listDeclaredGuidanceHooks(
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
  harnessIds: ReadonlyArray<HarnessId>,
): Promise<ReadonlySet<string>> {
  const declaredHooks = new Set<string>();

  for (const skill of resolvedSkills) {
    if (harnessIds.every((harnessId) => !skillTargetsHarness(skill, harnessId))) {
      continue;
    }
    const files = await listDeployedMarkdownFiles(skill.srcDir);
    for (const filePath of files) {
      const body = await expandIncludes(filePath, skill.contentRoot);
      const declarations = listGuidanceHooks(body, describeSourceLabel(skill.contentRoot, filePath));
      for (const { name } of declarations) {
        declaredHooks.add(name);
      }
    }
  }

  for (const subagent of resolvedSubagents) {
    const body = await expandIncludes(subagent.srcPath, subagent.contentRoot);
    const declarations = listGuidanceHooks(body, describeSourceLabel(subagent.contentRoot, subagent.srcPath));
    for (const { name } of declarations) {
      declaredHooks.add(name);
    }
  }

  return declaredHooks;
}

// region | Helpers

/** Names a body by its POSIX path under its content root, matching how the render pass anchors a directive error. */
function describeSourceLabel(contentRoot: string, filePath: string): string {
  return path.relative(contentRoot, filePath).split(path.sep).join('/');
}

/** Returns every Markdown file under `dir` that a skill deploy walk reaches, at any depth. */
async function listDeployedMarkdownFiles(dir: string): Promise<ReadonlyArray<string>> {
  const files: Array<string> = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isSkippedSkillEntry(entry.name)) {
      continue;
    }
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listDeployedMarkdownFiles(entryPath)));
    } else if (entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }
  return files;
}

// endregion | Helpers

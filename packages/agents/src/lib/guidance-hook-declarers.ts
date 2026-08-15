import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { expandIncludes } from './directive-expander.ts';
import { listGuidanceHooks } from './guidance-hooks.ts';
import { type ResolvedSkill, skillTargetsHarness } from './skill-deploy.ts';
import { isSkippedSkillEntry } from './skill-transform.ts';
import type { ResolvedSubagent } from './subagent-deploy.ts';
import type { HarnessId } from './types.ts';

/**
 * The deployed bodies declaring one guidance hook, split by the kind of context each is loaded into. A skill is loaded
 * into a session that already carries the ambient region; a subagent's context never carries it. That split is what
 * decides whether a bound rulebook also delivering `ambient` reaches an agent twice.
 */
export interface GuidanceHookDeclarers {
  readonly skills: ReadonlyArray<string>;
  readonly subagents: ReadonlyArray<string>;
}

/**
 * Maps each guidance hook the run's deployed bodies declare to the slugs declaring it, each list in deploy order and
 * free of repeats. A hook nothing declares is absent rather than empty, which is what makes a binding naming one
 * recognizable as unreached.
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
export async function findGuidanceHookDeclarers(
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
  harnessIds: ReadonlyArray<HarnessId>,
): Promise<ReadonlyMap<string, GuidanceHookDeclarers>> {
  const declarers = new Map<string, MutableDeclarers>();

  for (const skill of resolvedSkills) {
    if (harnessIds.every((harnessId) => !skillTargetsHarness(skill, harnessId))) {
      continue;
    }
    // Collected across the skill's files before any push, so a hook two of its bodies declare names the skill once.
    const hooks = new Set<string>();
    const files = await listDeployedMarkdownFiles(skill.srcDir);
    for (const filePath of files) {
      const body = await expandIncludes(filePath, skill.contentRoot);
      const declared = listGuidanceHooks(body, describeSourceLabel(skill.contentRoot, filePath));
      for (const { name } of declared) {
        hooks.add(name);
      }
    }
    for (const hook of hooks) {
      ensureDeclarers(declarers, hook).skills.push(skill.slug);
    }
  }

  for (const subagent of resolvedSubagents) {
    const body = await expandIncludes(subagent.srcPath, subagent.contentRoot);
    const declared = listGuidanceHooks(body, describeSourceLabel(subagent.contentRoot, subagent.srcPath));
    for (const { name } of declared) {
      ensureDeclarers(declarers, name).subagents.push(subagent.slug);
    }
  }

  return declarers;
}

// region | Helpers

/** One hook's declarers while the pass is still collecting them. */
interface MutableDeclarers {
  readonly skills: Array<string>;
  readonly subagents: Array<string>;
}

/** Names a body by its POSIX path under its content root, matching how the render pass anchors a directive error. */
function describeSourceLabel(contentRoot: string, filePath: string): string {
  return path.relative(contentRoot, filePath).split(path.sep).join('/');
}

/** Returns the accumulator for one hook, seeding an empty one the first time the hook is seen. */
function ensureDeclarers(declarers: Map<string, MutableDeclarers>, hook: string): MutableDeclarers {
  const existing = declarers.get(hook);
  if (existing !== undefined) {
    return existing;
  }
  const seeded: MutableDeclarers = { skills: [], subagents: [] };
  declarers.set(hook, seeded);
  return seeded;
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

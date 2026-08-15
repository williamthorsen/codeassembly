import path from 'node:path';

import { expandIncludes } from './directive-expander.ts';
import { listGuidanceHooks } from './guidance-hooks.ts';
import { type ResolvedSkill, skillTargetsHarness } from './skill-deploy.ts';
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
 * Maps each guidance hook the run's deployed bodies declare to the slugs declaring it, each list in deploy order. A
 * hook nothing declares is absent rather than empty, which is what makes a binding naming one recognizable as
 * unreached.
 *
 * Bodies are include-expanded first, so a directive a partial carries counts for every body inlining it — the same
 * reason `resolveRulebook` expands before its own hook checks. Only the entry file is read: a hook in a skill's
 * `_data/` support entry is unreachable by a binding, so it declares nothing.
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
    const body = await expandIncludes(path.join(skill.srcDir, 'SKILL.md'), skill.contentRoot);
    for (const { name } of listGuidanceHooks(body, skill.slug)) {
      readDeclarers(declarers, name).skills.push(skill.slug);
    }
  }

  for (const subagent of resolvedSubagents) {
    const body = await expandIncludes(subagent.srcPath, subagent.contentRoot);
    for (const { name } of listGuidanceHooks(body, subagent.slug)) {
      readDeclarers(declarers, name).subagents.push(subagent.slug);
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

/** Returns the accumulator for one hook, seeding an empty one the first time the hook is seen. */
function readDeclarers(declarers: Map<string, MutableDeclarers>, hook: string): MutableDeclarers {
  const existing = declarers.get(hook);
  if (existing !== undefined) {
    return existing;
  }
  const seeded: MutableDeclarers = { skills: [], subagents: [] };
  declarers.set(hook, seeded);
  return seeded;
}

// endregion | Helpers

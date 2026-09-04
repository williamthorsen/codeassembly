import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { ARTIFACT_TYPE_VALUES, artifactFrontmatterPath, type ArtifactType } from '../../lib/artifact-types.ts';
import type { ResolvedDeclaration } from '../../lib/codeassembly-manifest.ts';
import { type ContentDefect, foldHarnessDefects, type HarnessDefect } from '../../lib/content-defects.ts';
import { describeSearchedLocations, type SourceResolver } from '../../lib/content-sources.ts';
import type { DirectArtifacts } from '../../lib/dependency-resolver.ts';
import { findCrossNamespaceCollisions, findSkillNameCollisions } from '../../lib/deploy-collisions.ts';
import { listGuidanceHooks } from '../../lib/guidance-hooks.ts';
import { createContentRootLinkAnchor, createSkillLinkAnchor } from '../../lib/link-anchor.ts';
import { indexRulebooksBySlug, type ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import { extractRulebookSkillSlug } from '../../lib/rulebook-skill.ts';
import { renderRulebookBody } from '../../lib/rulebook-transform.ts';
import { type ResolvedSkill, skillTargetsHarness } from '../../lib/skill-deploy.ts';
import { renderSkillDirectory } from '../../lib/skill-transform.ts';
import { renderSubagent, type ResolvedSubagent } from '../../lib/subagent-deploy.ts';
import { isMissingFile } from '../../lib/type-guards.ts';
import type { HarnessId } from '../../lib/types.ts';
import type { ProbedAmbientHost } from './ambient-hosts.ts';
import { skillMarker, subagentMarker } from './owned-artifacts.ts';
import type {
  HarnessSkillTarget,
  HarnessSubagentTarget,
  ResolveAnchorContext,
  ResolveOverlay,
  ResolveRulebookContext,
} from './render-contexts.ts';
import type { SyncDomain } from './sync-domain.ts';

/**
 * Collects the skill and subagent destinations a sync would write, each paired with the predicate that recognizes its
 * own ownership marker, so the pre-write guard can reject any that already exist foreign-owned.
 */
export function collectOwnedTargets(
  harnessSkillTargets: ReadonlyArray<HarnessSkillTarget>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  harnessSubagentTargets: ReadonlyArray<HarnessSubagentTarget>,
  resolvedSubagents: ReadonlyArray<ResolvedSubagent>,
): ReadonlyArray<OwnedTarget> {
  const targets: Array<OwnedTarget> = [];
  for (const { skillsDir, harnessId } of harnessSkillTargets) {
    for (const rulebook of resolved) {
      if (rulebook.skill) {
        targets.push({
          filePath: path.join(skillsDir, rulebook.skillName, 'SKILL.md'),
          isOwned: (content) => extractRulebookSkillSlug(content) !== undefined,
        });
      }
    }
    for (const skill of resolvedSkills) {
      if (!skillTargetsHarness(skill, harnessId)) {
        continue;
      }
      targets.push({
        filePath: path.join(skillsDir, skill.slug, 'SKILL.md'),
        isOwned: (content) => skillMarker.extractSlug(content) !== undefined,
      });
    }
  }
  for (const target of harnessSubagentTargets) {
    for (const subagent of resolvedSubagents) {
      targets.push({
        filePath: path.join(target.subagentsDir, `${subagent.slug}.md`),
        isOwned: (content) => subagentMarker.extractSlug(content) !== undefined,
      });
    }
  }
  return targets;
}

/** Builds the collector every pre-write gate reports into. */
export function createDefectCollector(): DefectCollector {
  const collected: Array<ContentDefect> = [];
  return {
    add(found) {
      collected.push(...found);
    },
    get found() {
      return collected;
    },
  };
}

/** Collects the defects reported by a sync's pre-write gates, so the run fails once on the whole list. */
export interface DefectCollector {
  readonly found: ReadonlyArray<ContentDefect>;
  add(found: ReadonlyArray<ContentDefect>): void;
}

/**
 * Drops every seed already reported as unresolvable, so the closure walk does not report the same slug a second time
 * as a missing edge. A slug reachable only through a dropped seed is unreported here, and the dropped seed's own
 * defect is what sends the reader to it.
 */
export function dropUnresolvableSeeds(seeds: DirectArtifacts, unresolvable: UnresolvableSlugs): DirectArtifacts {
  const kept: Record<ArtifactType, Array<string>> = { rulebook: [], skill: [], subagent: [], collection: [] };
  for (const type of ARTIFACT_TYPE_VALUES) {
    kept[type] = (seeds[type] ?? []).filter((slug) => !unresolvable[type].has(slug));
  }
  return kept;
}

/**
 * Reports each bound rulebook whose own body declares a guidance hook. Bound guidance is spliced as rendered, so a hook
 * inside it has no pass left that could fill it. Checked here, against the unrendered body, because the rulebook
 * renderer strips the directive and the evidence is gone by the time a fill is built.
 */
export function findBoundRulebookHookDefects(
  bindings: ReadonlyMap<string, ReadonlyArray<string>>,
  resolved: ReadonlyArray<ResolvedRulebook>,
): ReadonlyArray<ContentDefect> {
  const defects: Array<ContentDefect> = [];
  const bySlug = indexRulebooksBySlug(resolved);
  for (const [hook, slugs] of bindings) {
    for (const slug of slugs) {
      // A bound rulebook rejected by the resolution pass is absent from the closure, and its own defect already names it.
      const bound = bySlug.get(slug);
      if (bound === undefined) {
        continue;
      }
      const declared = listGuidanceHooks(bound.body, `guidance/rulebooks/${slug}.md`);
      if (declared.length > 0) {
        const names = declared.map((declaration) => declaration.name).join(', ');
        defects.push({
          file: artifactFrontmatterPath('rulebook', slug),
          kind: 'frontmatter',
          detail:
            `Rulebook "${slug}", bound to guidance hook "${hook}", declares a guidance hook of its own (${names}). ` +
            'Bound guidance is spliced as rendered, so nothing can fill a hook inside it: remove the directive, or ' +
            'bind a rulebook that carries none.',
        });
      }
    }
  }
  return defects;
}

/**
 * Reports each rulebook-skill directory name colliding with a declared-skill directory name, which would let the two
 * delivery namespaces clobber each other in a shared project-local skills dir. Failing here, before any write,
 * forces the conflict to be resolved by renaming one side rather than letting the last write win.
 */
export function findCrossNamespaceCollisionDefects(
  rulebookSkillDirs: ReadonlyArray<string>,
  declaredSkillSlugs: ReadonlySet<string>,
): ReadonlyArray<ContentDefect> {
  return findCrossNamespaceCollisions(rulebookSkillDirs, declaredSkillSlugs).map((name) => ({
    file: artifactFrontmatterPath('skill', name),
    kind: 'collision',
    detail:
      `Skill directory name collision across delivery namespaces: ${name} is delivered as both a rulebook skill ` +
      'and a declared skill. Rename one so they no longer share a directory.',
  }));
}

/**
 * Reports every host `sync` would write that already carries a damaged region — an unmatched marker, or more than one.
 * Only the sync-owned project-local host can be appended to, so only it needs the guard; the harness-home path skips
 * such a file with a warning instead. Runs before any write so a dry-run surfaces the conflict with nothing changed.
 */
export function findDamagedAmbientHostDefects(
  probed: ReadonlyArray<ProbedAmbientHost>,
  domain: SyncDomain,
  resolved: ReadonlyArray<ResolvedRulebook>,
): ReadonlyArray<ContentDefect> {
  // Asks whether anything would be delivered, which is a property of the declaration alone. Rendering could answer it
  // too, but rendering can now fail on a bad link, and this guard is about region damage rather than link validity.
  if (domain.ambient !== 'project-local' || resolved.every((rulebook) => !rulebook.ambient)) {
    return [];
  }
  const defects: Array<ContentDefect> = [];
  for (const { hostPath, state } of probed) {
    if (state.status === 'malformed') {
      defects.push({
        file: hostPath,
        kind: 'target',
        detail:
          'Refusing to deliver ambient guidance into a file carrying a damaged ambient region (an unmatched marker, ' +
          'or more than one region). Repair the codeassembly-ambient markers, then re-run.',
      });
    }
  }
  return defects;
}

/**
 * Renders every declared skill against every targeted harness, discarding the output, so a broken include or an
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
      if (!skillTargetsHarness(skill, target.harnessId)) {
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
 * Renders every declared subagent against every targeted harness, discarding the output, so an unmapped tool
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
 * Reports every planned target that already exists without this sync's ownership marker — an install-managed or
 * hand-authored file. Failing here, before any write or delete, is what keeps a same-named foreign file from being
 * overwritten; the marker-gated retraction scans separately keep it from being deleted. Absent targets are safe.
 */
export async function findForeignOwnedTargetDefects(
  targets: ReadonlyArray<OwnedTarget>,
): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  for (const target of targets) {
    let content: string;
    try {
      content = await readFile(target.filePath, 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    if (!target.isOwned(content)) {
      defects.push({
        file: target.filePath,
        kind: 'target',
        detail:
          'Refusing to overwrite a file not owned by sync (install-managed or hand-authored). Rename or remove it, ' +
          'or retire the conflicting install artifact, then re-run.',
      });
    }
  }
  return defects;
}

/**
 * Renders every resolved rulebook against every targeted harness, discarding the output, so a link target the
 * delivery pipeline cannot honor is reported before any file is written. Both delivery passes re-render at write time;
 * this pass exists only to fail the run closed, including under `--dry-run`.
 */
export function findRulebookRenderDefects(
  harnessIds: ReadonlyArray<HarnessId>,
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolveRulebookContext: ResolveRulebookContext,
): ReadonlyArray<ContentDefect> {
  const raised: Array<HarnessDefect> = [];
  for (const harnessId of harnessIds) {
    for (const rulebook of resolved) {
      try {
        renderRulebookBody(rulebook.body, rulebook.slug, resolveRulebookContext(harnessId, rulebook.source));
      } catch (error: unknown) {
        raised.push(describeRenderDefect('rulebook', rulebook.slug, harnessId, error));
      }
    }
  }
  return foldHarnessDefects(raised, harnessIds);
}

/**
 * Reports every pair of skill-delivery rulebooks resolving to the same skill name, which would share one directory and
 * clobber each other. Failing here, before any write, forces the conflict to be resolved with a `skill-name`
 * override rather than silently letting the last write win.
 */
export function findSkillNameCollisionDefects(resolved: ReadonlyArray<ResolvedRulebook>): ReadonlyArray<ContentDefect> {
  return findSkillNameCollisions(resolved).map((collision) => ({
    file: artifactFrontmatterPath('rulebook', collision.slugs[0] ?? collision.skillName),
    kind: 'collision',
    detail:
      `Skill name collision: rulebooks ${collision.slugs.join(', ')} all resolve to skill "${collision.skillName}". ` +
      'Give all but one a distinct `skill-name`.',
  }));
}

/**
 * Reports each guidance-hook binding naming a rulebook that resolves from no declared source or the library, naming
 * both the slug and the hook that bound it. Seeding the closure would catch the same slug, but only as an anonymous
 * missing reference: the hook name is the half that says where to go and fix it.
 */
export async function findUnresolvableBindingDefects(
  bindings: ReadonlyMap<string, ReadonlyArray<string>>,
  resolver: SourceResolver,
): Promise<{ defects: ReadonlyArray<ContentDefect>; unresolvable: ReadonlySet<string> }> {
  const defects: Array<ContentDefect> = [];
  const unresolvable = new Set<string>();
  for (const [hook, slugs] of bindings) {
    for (const slug of slugs) {
      if ((await resolver.resolve('rulebook', slug)) !== undefined) {
        continue;
      }
      unresolvable.add(slug);
      defects.push({
        file: artifactFrontmatterPath('rulebook', slug),
        kind: 'resolution',
        detail:
          `Guidance hook "${hook}" binds rulebook "${slug}", which was not found in any of: ` +
          describeSearchedLocations(resolver, 'rulebook', slug),
      });
    }
  }
  return { defects, unresolvable };
}

/**
 * Reports each artifact a declaration's own `use:` list names that resolves from no declared source or the
 * library, naming the chain files that declare it alongside the slug. The closure catches the same slug, but only
 * as an anonymous missing reference: The declaring file is the half that says where to go and fix it, and a path
 * derived from the domain cannot supply it, since either tier of the chain could have named the slug.
 */
export async function findUnresolvableDeclaredArtifactDefects(
  declaration: ResolvedDeclaration,
  scope: 'home' | 'project',
  resolver: SourceResolver,
): Promise<{ defects: ReadonlyArray<ContentDefect>; unresolvable: UnresolvableSlugs }> {
  const defects: Array<ContentDefect> = [];
  const unresolvable: Record<ArtifactType, Set<string>> = {
    rulebook: new Set(),
    skill: new Set(),
    subagent: new Set(),
    collection: new Set(),
  };
  for (const type of ARTIFACT_TYPE_VALUES) {
    const declared = declaration.declaredIn[type];
    for (const [slug, declaredIn] of declared) {
      if ((await resolver.resolve(type, slug)) !== undefined) {
        continue;
      }

      unresolvable[type].add(slug);
      defects.push({
        file: artifactFrontmatterPath(type, slug),
        kind: 'resolution',
        detail:
          `The ${scope} declaration (${declaredIn.join(', ')}) declares ${type} "${slug}", which was not found ` +
          `in any of: ${describeSearchedLocations(resolver, type, slug)}`,
      });
    }
  }
  return { defects, unresolvable };
}

/** A planned write whose destination must be sync-owned (or absent) before the write proceeds. */
export interface OwnedTarget {
  readonly filePath: string;
  readonly isOwned: (content: string) => boolean;
}

/**
 * Resolves each slug, reporting the ones that fail rather than abandoning the rest. What resolved is what the passes
 * below run over, so an artifact reported here is absent from them rather than carried forward half-resolved.
 */
export async function resolveEachArtifact<T>(
  type: ArtifactType,
  slugs: ReadonlyArray<string>,
  resolve: (slug: string) => Promise<T>,
): Promise<{ resolved: ReadonlyArray<T>; defects: ReadonlyArray<ContentDefect> }> {
  const resolved: Array<T> = [];
  const defects: Array<ContentDefect> = [];
  for (const slug of slugs) {
    try {
      resolved.push(await resolve(slug));
    } catch (error: unknown) {
      defects.push({ file: artifactFrontmatterPath(type, slug), kind: 'resolution', detail: describeError(error) });
    }
  }
  return { resolved, defects };
}

/** Declared slugs per type that resolve from nowhere, so the closure walk can skip a seed already reported. */
export type UnresolvableSlugs = Record<ArtifactType, ReadonlySet<string>>;

// region | Helpers

/** Builds one artifact's render defect, holding the harness so the fold can tell a body-local failure from a scoped one. */
function describeRenderDefect(type: ArtifactType, slug: string, harnessId: HarnessId, error: unknown): HarnessDefect {
  return {
    harnessId,
    defect: { file: artifactFrontmatterPath(type, slug), kind: 'render', detail: describeError(error) },
  };
}

// endregion | Helpers

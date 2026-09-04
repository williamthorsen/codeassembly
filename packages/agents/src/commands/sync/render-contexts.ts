import { type GuidanceHookFills } from '../../lib/guidance-hooks.ts';
import { HARNESSES, resolveHarnessPaths } from '../../lib/harness.ts';
import { loadHarnessOverlay } from '../../lib/harness-overlay.ts';
import type { RulebookInvocationCatalog } from '../../lib/invocation-tokens.ts';
import { createContentRootLinkAnchor, type LinkAnchorContext } from '../../lib/link-anchor.ts';
import type { ResolveLinkAnchor } from '../../lib/path-rewriter.ts';
import type { ResolvedRulebook } from '../../lib/rulebook-deploy.ts';
import type { RulebookRenderContext } from '../../lib/rulebook-transform.ts';
import { type ResolvedSkill, skillTargetsHarness } from '../../lib/skill-deploy.ts';
import type { SkillDeployContext } from '../../lib/skill-transform.ts';
import type { SubagentDeployContext } from '../../lib/subagent-deploy.ts';
import type { HarnessId } from '../../lib/types.ts';

/**
 * Indexes the deployed rulebooks by slug, so a `{rulebook:<slug>}` token renders the skill name its target deploys
 * under. Harness-invariant, unlike the render contexts that carry it: What a rulebook deploys as does not vary by
 * harness.
 */
export function buildRulebookInvocationCatalog(resolved: ReadonlyArray<ResolvedRulebook>): RulebookInvocationCatalog {
  return new Map(resolved.map((rulebook) => [rulebook.slug, { skillName: rulebook.skillName, skill: rulebook.skill }]));
}

/**
 * Builds the resolver of anchor inputs for one harness and one owning source. `rulebookSkillDirs` names the skill
 * directories the rulebook-delivery pass writes, which reach every targeted harness; `resolvedSkills` is filtered per
 * harness instead, because a declared skill may target only some.
 */
export function createAnchorContextResolver(
  resolvedSkills: ReadonlyArray<ResolvedSkill>,
  rulebookSkillDirs: ReadonlyArray<string>,
  domainBase: string,
): ResolveAnchorContext {
  return (harnessId, supportNamespace) => {
    const config = HARNESSES[harnessId];
    return {
      supportNamespace,
      deployedSkillDirs: new Set([
        ...resolvedSkills.filter((skill) => skillTargetsHarness(skill, harnessId)).map((skill) => skill.slug),
        ...rulebookSkillDirs,
      ]),
      domainBase,
      guidanceFileName: config.guidanceFileName,
      homeDir: config.homeDir,
      skillsDirName: config.skillsDirName,
    };
  };
}

/**
 * Builds a memoized reader of the subagent frontmatter overlay, keyed on the harness and the content root a subagent
 * resolved from. Memoized because every subagent from one source reads the same overlay, and the pre-write render
 * gate reads each of them a second time.
 */
export function createOverlayLoader(): ResolveOverlay {
  const cache = new Map<string, Promise<string>>();
  return (harnessId, contentRoot) => {
    const key = `${harnessId}\u{0}${contentRoot}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const loading = loadHarnessOverlay(contentRoot, HARNESSES[harnessId]);
    cache.set(key, loading);
    return loading;
  };
}

/** Builds the resolver of one harness's rulebook render context, anchored through `resolveAnchorContext`. */
export function createRulebookContextResolver(
  resolved: ReadonlyArray<ResolvedRulebook>,
  resolveAnchorContext: ResolveAnchorContext,
): ResolveRulebookContext {
  return (harnessId, supportNamespace) =>
    buildRulebookRenderContext(
      harnessId,
      resolved,
      createContentRootLinkAnchor(resolveAnchorContext(harnessId, supportNamespace)),
    );
}

/** One targeted harness's id and project-local skills dir paired with the per-harness inputs the skill transform needs. */
export interface HarnessSkillTarget {
  readonly harnessId: HarnessId;
  readonly skillsDir: string;
  /** Everything but the anchor, which the owning source decides and so is supplied per skill. */
  readonly deployContext: Omit<SkillDeployContext, 'anchor'>;
}

/** One targeted harness's project-local subagents dir paired with the per-harness inputs the deploy transform needs. */
export interface HarnessSubagentTarget {
  readonly harnessId: HarnessId;
  readonly subagentsDir: string;
  /** Everything but the anchor and the overlay, which the owning source decides and so are supplied per subagent. */
  readonly deployContext: Omit<SubagentDeployContext, 'anchor' | 'overlayYaml'>;
}

/**
 * Resolves the anchor inputs for one harness and one owning source (`undefined` = the built-in library). The owner is
 * a per-artifact input rather than a per-harness one, because only it distinguishes a link into a source's own support
 * tree from the same target written by a library artifact.
 */
export type ResolveAnchorContext = (harnessId: HarnessId, supportNamespace: string | undefined) => LinkAnchorContext;

/**
 * Reads the frontmatter overlay one harness applies to subagents resolved from `contentRoot`. Source-scoped rather
 * than per-harness: a subagent merges against the overlay of the root it came from, so a source shipping none merges
 * against nothing.
 */
export type ResolveOverlay = (harnessId: HarnessId, contentRoot: string) => Promise<string>;

/**
 * Builds one harness's rulebook render context. Threaded rather than rebuilt per call site so the pre-write gate,
 * ambient delivery, and skill delivery all render a rulebook body against the same anchor.
 */
export type ResolveRulebookContext = (
  harnessId: HarnessId,
  supportNamespace: string | undefined,
) => RulebookRenderContext;

/**
 * Resolves one harness's project-local skills dir together with the per-harness inputs the skill transform needs: the
 * link anchor, the home-dir segment, and the harness ID. Passing `projectRoot` as the base keeps delivery
 * project-scoped.
 */
export function resolveSkillTarget(
  harnessId: HarnessId,
  projectRoot: string,
  rulebooks: RulebookInvocationCatalog,
  guidanceHookFills: GuidanceHookFills | undefined,
): HarnessSkillTarget {
  const harnessConfig = HARNESSES[harnessId];
  return {
    harnessId,
    skillsDir: resolveHarnessPaths(harnessId, projectRoot).skillsDir,
    deployContext: {
      guidanceFileName: harnessConfig.guidanceFileName,
      homeDir: harnessConfig.homeDir,
      harnessId: harnessConfig.id,
      skillSigil: harnessConfig.skillSigil,
      subagentSigil: harnessConfig.subagentSigil,
      rulebooks,
      guidanceHookFills,
    },
  };
}

/**
 * Resolves one harness's project-local subagents dir together with the per-harness inputs the deploy transform needs:
 * the link anchor, the home-dir segment, and the harness id. Passing `projectRoot` as the base keeps delivery
 * project-scoped, matching the skill passes.
 */
export function resolveSubagentTarget(
  harnessId: HarnessId,
  projectRoot: string,
  rulebooks: RulebookInvocationCatalog,
  guidanceHookFills: GuidanceHookFills | undefined,
): HarnessSubagentTarget {
  const harnessConfig = HARNESSES[harnessId];
  return {
    harnessId,
    subagentsDir: resolveHarnessPaths(harnessId, projectRoot).subagentsDir,
    deployContext: {
      guidanceFileName: harnessConfig.guidanceFileName,
      homeDir: harnessConfig.homeDir,
      harnessId: harnessConfig.id,
      skillSigil: harnessConfig.skillSigil,
      subagentSigil: harnessConfig.subagentSigil,
      rulebooks,
      guidanceHookFills,
    },
  };
}

// region | Helpers

/**
 * The per-harness inputs a rulebook render depends on: the harness config's own segments and sigils, the anchor its
 * link targets resolve through, and the deployed rulebooks indexed by slug, so a `{rulebook:<slug>}` token renders the
 * skill name its target deploys under.
 */
function buildRulebookRenderContext(
  harnessId: HarnessId,
  resolved: ReadonlyArray<ResolvedRulebook>,
  anchor: ResolveLinkAnchor,
): RulebookRenderContext {
  const config = HARNESSES[harnessId];
  return {
    anchor,
    guidanceFileName: config.guidanceFileName,
    homeDir: config.homeDir,
    harnessId: config.id,
    skillSigil: config.skillSigil,
    subagentSigil: config.subagentSigil,
    rulebooks: buildRulebookInvocationCatalog(resolved),
  };
}

// endregion | Helpers

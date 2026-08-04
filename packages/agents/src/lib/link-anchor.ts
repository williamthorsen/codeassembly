import type { ResolveLinkAnchor } from './path-rewriter.ts';

/**
 * Directory under a harness skills dir holding each declared source's support entries, one subtree per source. Kept out
 * of the skills dir's flat namespace so a source's `_data` can never mask the library's, or another source's.
 */
export const SOURCE_SUPPORT_DIR = '_sources';

/**
 * What deciding a target's deployed location depends on, resolved once per harness — and, where support entries are
 * reachable, once per owning source — by the caller.
 */
export interface LinkAnchorContext {
  /**
   * Skill directory names this run writes into the domain's skills dir, for the harness being rendered for. A target
   * opening with one of these names something the run just deployed; anything else it cannot place under the domain.
   */
  readonly deployedSkillDirs: ReadonlySet<string>;
  /**
   * Root the deploying domain writes under: `~` for the home domain, the absolute project root for the project domain.
   * Only the trees `sync` populates are anchored here; the trees `install` populates stay under `~` in both domains.
   */
  readonly domainBase: string;
  /** Harness home segment (e.g. `.claude`). */
  readonly homeDir: string;
  /** Skills directory name within the harness home (e.g. `skills`). */
  readonly skillsDirName: string;
  /**
   * Name of the declared source that owns the body being rendered, or `undefined` for the built-in library. A source
   * ships its own support entries, which deploy into a namespace of its own; the library's stay where `install` puts
   * them. Nothing about the target itself distinguishes the two, since `_data/x.md` reads the same either way.
   */
  readonly supportNamespace: string | undefined;
}

/**
 * Anchors targets written relative to a content root, the form a rulebook or subagent body uses (`skills/…`,
 * `scripts/…`). A target reaching into `skills/` is handed to the skills anchor; anything else keeps the harness home,
 * since `scripts/` and its siblings deploy there and nowhere else.
 */
export function createContentRootLinkAnchor(context: LinkAnchorContext): ResolveLinkAnchor {
  const { homeDir, skillsDirName } = context;
  const resolveWithinSkills = createSkillLinkAnchor(context);
  return (normalizedTarget) => {
    const withinSkills = stripLeadingSegment(normalizedTarget, skillsDirName);
    return withinSkills === undefined ? `~/${homeDir}/${normalizedTarget}` : resolveWithinSkills(withinSkills);
  };
}

/**
 * Anchors targets written relative to a harness skills dir, the form a skill body's links resolve to.
 *
 * Three destinations. A target whose first segment names a skill directory this run deploys resolves under the
 * deploying domain, because that is where the run just wrote it. A target owned by a declared source resolves into
 * that source's support namespace under the domain, because this run delivers it there. Everything else keeps the
 * harness home: the library's support entries land there because `install` puts them there in either domain, and a
 * skill this run does not deploy is addressable there or nowhere.
 *
 * In the home domain the domain-rooted destinations coincide with the harness home, so home-domain output changes only
 * where a source namespace applies — which is content that reached no address at all before.
 */
export function createSkillLinkAnchor(context: LinkAnchorContext): ResolveLinkAnchor {
  const { deployedSkillDirs, domainBase, homeDir, skillsDirName, supportNamespace } = context;
  const skillsRoot = `${homeDir}/${skillsDirName}`;
  return (normalizedTarget) => {
    if (deployedSkillDirs.has(readFirstSegment(normalizedTarget))) {
      return `${domainBase}/${skillsRoot}/${normalizedTarget}`;
    }
    return supportNamespace === undefined
      ? `~/${skillsRoot}/${normalizedTarget}`
      : `${domainBase}/${skillsRoot}/${SOURCE_SUPPORT_DIR}/${supportNamespace}/${normalizedTarget}`;
  };
}

// region | Helpers

/** Reads the first path segment of a POSIX-style relative path, which is the whole path when it carries no separator. */
function readFirstSegment(relPath: string): string {
  const slashIndex = relPath.indexOf('/');
  return slashIndex === -1 ? relPath : relPath.slice(0, slashIndex);
}

/** Returns what follows `segment/` at the start of `relPath`, or `undefined` when `relPath` does not open with it. */
function stripLeadingSegment(relPath: string, segment: string): string | undefined {
  const prefix = `${segment}/`;
  return relPath.startsWith(prefix) ? relPath.slice(prefix.length) : undefined;
}

// endregion | Helpers

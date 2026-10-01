import type { ResolveLinkAnchor } from './path-rewriter.ts';

/**
 * Directory under a harness skills dir holding each declared source's support entries, one subtree per source. Kept out
 * of the skills dir's flat namespace so that a source's `_data` can never mask another source's.
 */
export const SOURCE_SUPPORT_DIR = '_sources';

/**
 * The inputs on which a target's deployed location depends, resolved once per harness -- and, when support entries are
 * reachable, once per owning source -- by the caller.
 */
export interface LinkAnchorContext {
  /**
   * Skill directory names that this run writes into the domain's skills dir, for the harness being rendered for. A
   * target opening with one of these names something that the run just deployed; anything else it cannot place under
   * the domain.
   */
  readonly deployedSkillDirs: ReadonlySet<string>;
  /**
   * Root under which the deploying domain writes: `~` for the home domain, the absolute project root for the project
   * domain. Only the trees that `sync` populates are anchored here; the scripts that `install` populates stay under
   * `~` in both domains.
   */
  readonly domainBase: string;
  /** Harness home segment (e.g. `.claude`). */
  readonly homeDir: string;
  /** Skills directory name within the harness home (e.g. `skills`). */
  readonly skillsDirName: string;
  /** Names of the support entries that the owning source ships directly under its `skills/` directory. */
  readonly supportEntries: ReadonlySet<string>;
  /**
   * Name of the declared source that owns the body being rendered. A source ships its own support entries, which
   * deploy into a namespace of its own, so a support target resolves into the namespace of the body's owner.
   */
  readonly supportNamespace: string;
}

/**
 * Anchors targets written relative to a content root, the form that a rulebook or subagent body uses (`skills/…`,
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
 * Anchors targets written relative to a harness skills dir, the form to which a skill body's links resolve.
 *
 * Three destinations. A target whose first segment names a skill directory that this run deploys resolves under the
 * deploying domain, because that is where the run just wrote it. A target whose first segment names one of the owning
 * source's support entries resolves into that source's support namespace under the domain, because this run delivers
 * the entries there. Everything else keeps the harness home: A skill that this run does not deploy is addressable
 * there or nowhere.
 *
 * In the home domain the domain-rooted destinations coincide with the harness home, so only a source namespace
 * distinguishes them there.
 */
export function createSkillLinkAnchor(context: LinkAnchorContext): ResolveLinkAnchor {
  const { deployedSkillDirs, domainBase, homeDir, skillsDirName, supportEntries, supportNamespace } = context;
  const skillsRoot = `${homeDir}/${skillsDirName}`;
  return (normalizedTarget) => {
    const firstSegment = readFirstSegment(normalizedTarget);
    if (deployedSkillDirs.has(firstSegment)) {
      return `${domainBase}/${skillsRoot}/${normalizedTarget}`;
    }
    return supportEntries.has(firstSegment)
      ? `${domainBase}/${skillsRoot}/${SOURCE_SUPPORT_DIR}/${supportNamespace}/${normalizedTarget}`
      : `~/${skillsRoot}/${normalizedTarget}`;
  };
}

// region | Helpers

/**
 * Reads the first path segment of a POSIX-style relative path, which is the whole path when it does not contain a
 * separator.
 */
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

import type { ResolveLinkAnchor } from './path-rewriter.ts';

/** What deciding a target's deployed location depends on, resolved once per harness by the caller. */
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
 * Two destinations, decided by whether the target's first segment names a skill directory this run deploys. One that
 * does resolves under the deploying domain, because that is where the run just wrote it. Everything else keeps the
 * harness home: a support entry lands there because `install` puts it there in either domain, and a skill this run
 * does not deploy is addressable there or nowhere.
 *
 * In the home domain the two destinations coincide, so home-domain output cannot change whatever the set holds.
 */
export function createSkillLinkAnchor(context: LinkAnchorContext): ResolveLinkAnchor {
  const { deployedSkillDirs, domainBase, homeDir, skillsDirName } = context;
  const skillsRoot = `${homeDir}/${skillsDirName}`;
  return (normalizedTarget) =>
    deployedSkillDirs.has(readFirstSegment(normalizedTarget))
      ? `${domainBase}/${skillsRoot}/${normalizedTarget}`
      : `~/${skillsRoot}/${normalizedTarget}`;
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

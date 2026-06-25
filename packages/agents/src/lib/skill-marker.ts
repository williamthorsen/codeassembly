/** Matches the declared-skill ownership marker anywhere in a file, capturing its slug. */
const MARKER_PATTERN = /<!-- codeassembly-skill:([a-z0-9-]+) -->/;

/** Matches a leading `---\n...\n---\n` frontmatter block, capturing it including the closing delimiter's newline. */
const FRONTMATTER_PATTERN = /^(---\n[\s\S]*?\n---\n)/;

/** Matches a declared-skill marker line at the very start of a string, used to strip it before re-injecting. */
const LEADING_MARKER_LINE_PATTERN = /^<!-- codeassembly-skill:[a-z0-9-]+ -->\n/;

/** Returns the slug stamped in a skill file's declared-skill ownership marker, or `undefined` when it carries none. */
export function extractDeployedSkillSlug(content: string): string | undefined {
  return MARKER_PATTERN.exec(content)?.[1];
}

/**
 * Stamps a sync-deployed skill file with the declared-skill ownership marker, placed on its own line immediately
 * after the frontmatter block — the same position `renderSkillFile` uses for the rulebook marker.
 * Idempotent: An existing declared-skill marker line directly after the frontmatter is replaced rather than duplicated,
 * so re-deploying unchanged content is byte-stable.
 * Throws when the content has no frontmatter block, because a marker-less skill cannot be reliably stamped.
 */
export function injectSkillMarker(content: string, slug: string): string {
  const frontmatter = FRONTMATTER_PATTERN.exec(content)?.[1];
  if (frontmatter === undefined) {
    throw new Error('Cannot inject the skill ownership marker: the content has no frontmatter block.');
  }

  const afterFrontmatter = content.slice(frontmatter.length).replace(LEADING_MARKER_LINE_PATTERN, '');
  return `${frontmatter}<!-- codeassembly-skill:${slug} -->\n${afterFrontmatter}`;
}

import { stringify as stringifyYaml } from 'yaml';

/** Returns the slug stamped in a skill file's sync ownership marker, or `undefined` when it carries none. */
export function extractRulebookSkillSlug(content: string): string | undefined {
  return /<!-- codeassembly-rulebook:([a-z0-9-]+) -->/.exec(content)?.[1];
}

/**
 * Renders a thin-wrapper skill file for a rulebook delivered in `skill` mode: standard skill frontmatter
 * (`name`, `description`, `user-invocable`), the sync ownership marker, and the rulebook's neutral body. The
 * output is byte-deterministic — `lineWidth: 0` prevents the description from line-folding — so re-running
 * `sync` with unchanged content leaves the file untouched.
 */
export function renderSkillFile(slug: string, description: string | undefined, body: string): string {
  const frontmatter = {
    name: slug,
    ...(description ? { description } : {}),
    'user-invocable': true,
  };
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n${ownershipMarker(slug)}\n\n${body.trim()}\n`;
}

// region | Helpers

/** The provenance marker stamped into every sync-generated skill, identifying it as sync-owned. */
function ownershipMarker(slug: string): string {
  return `<!-- codeassembly-rulebook:${slug} -->`;
}

// endregion | Helpers

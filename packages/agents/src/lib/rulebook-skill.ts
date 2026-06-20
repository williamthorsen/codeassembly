import { stringify as stringifyYaml } from 'yaml';

/** Returns the slug stamped in a skill file's sync ownership marker, or `undefined` when it carries none. */
export function extractRulebookSkillSlug(content: string): string | undefined {
  return /<!-- codeassembly-rulebook:([a-z0-9-]+) -->/.exec(content)?.[1];
}

/**
 * Renders a thin-wrapper skill file for a rulebook delivered in `skill` mode: standard skill frontmatter
 * (`name`, `description`, `user-invocable`), the sync ownership marker, and the rulebook's neutral body. The
 * frontmatter `name` is the resolved skill name (the display label); the ownership marker carries the stable
 * `slug`, so retraction can recover a rulebook's identity even when its skill name and directory differ. The
 * output is byte-deterministic — `lineWidth: 0` prevents the description from line-folding — so re-running
 * `sync` with unchanged content leaves the file untouched.
 *
 * `user-invocable` is always `true`: on-demand rulebook skills are meant to be invocable, and rulebook
 * frontmatter deliberately carries no per-rulebook opt-out.
 */
export function renderSkillFile(
  skillName: string,
  slug: string,
  description: string | undefined,
  body: string,
): string {
  const frontmatter = {
    name: skillName,
    ...(description ? { description } : {}),
    'user-invocable': true,
  };
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n${ownershipMarker(slug)}\n\n${body.trim()}\n`;
}

/**
 * Resolves a skill-delivery rulebook's skill name — the on-disk directory and the `/` command. A `skill-name`
 * frontmatter override is used verbatim; absent it, the name is the slug under a `consult-` prefix, which reads
 * as bringing the guidance to bear rather than as a request to display the bare-slug content.
 */
export function resolveSkillName(slug: string, override?: string): string {
  return override ?? `consult-${slug}`;
}

// region | Helpers

/** The provenance marker stamped into every sync-generated skill, identifying it as sync-owned. */
function ownershipMarker(slug: string): string {
  return `<!-- codeassembly-rulebook:${slug} -->`;
}

// endregion | Helpers

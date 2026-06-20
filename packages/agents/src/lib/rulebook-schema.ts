import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { parseFrontmatter } from './frontmatter-merger.ts';

/** Lowercase kebab-case, the shape required of any token that becomes a directory or `/` command. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Frontmatter schema for a rulebook source file. The operational fields drive the resolver; unknown keys
 * (e.g. future classification metadata) are accepted but dropped, not preserved on the parsed object.
 * `delivery` is normalized to an array, and `version` is treated as an opaque string, never parsed as semver.
 * `skill-name` overrides the rendered skill's name (and directory) for `skill` delivery; absent it, the name
 * is derived from the slug.
 */
export const RulebookFrontmatterSchema = z.object({
  slug: z.string().regex(KEBAB_CASE, 'slug must be lowercase kebab-case (e.g. shell-conventions)'),
  description: z.string().optional(),
  'skill-name': z
    .string()
    .regex(KEBAB_CASE, 'skill-name must be lowercase kebab-case (e.g. shell-conventions-rulebook)')
    .optional(),
  delivery: z
    .union([z.string(), z.array(z.string())])
    .default('ambient')
    .transform((value) => (typeof value === 'string' ? [value] : value)),
  version: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => (value === undefined ? undefined : String(value))),
});

/** A validated rulebook's operational frontmatter. */
export type Rulebook = z.infer<typeof RulebookFrontmatterSchema>;

/**
 * Splits a rulebook source file into its validated operational frontmatter and its neutral body (frontmatter
 * removed). Throws a readable error, naming `sourceLabel` when provided, if the frontmatter fails validation.
 */
export function parseRulebookFile(content: string, sourceLabel?: string): { rulebook: Rulebook; body: string } {
  const { lines, body } = parseFrontmatter(content);
  const frontmatter: unknown = parseYaml(lines.join('\n'));
  const result = RulebookFrontmatterSchema.safeParse(frontmatter);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;
    throw new Error(`Invalid rulebook frontmatter${where}: ${detail}`);
  }

  return { rulebook: result.data, body };
}

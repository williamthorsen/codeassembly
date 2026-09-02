import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { parseFrontmatter } from './frontmatter-merger.ts';

/** Lowercase kebab-case, the shape required of any token that becomes a directory or `/` command. */
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The routes guidance takes into a session. `ambient` and `skill` instruct the resolver, which inlines an ambient
 * block or renders a `consult-<slug>` skill. `hook` instructs nothing: a rulebook cannot cause its own transclusion,
 * because the binding that splices it into a host body lives in a `codeassembly.yaml` rather than in the rulebook.
 * Declaring it records the route the rulebook is reached by, which is what lets a mismatch between the two be named.
 */
const DeliveryModeSchema = z.enum(['ambient', 'hook', 'skill']);

/**
 * The rejection every malformed `delivery` carries, whichever branch failed. Named once and attached to both, because
 * a union reports its own failure for a value neither member accepts but surfaces a member's issue verbatim when only
 * that member applies, which an empty list does.
 */
const DELIVERY_ERROR = "delivery must be 'ambient', 'hook', or 'skill', or a non-empty list of them";

/** The rejection a non-string `version` carries: it reached the schema as a number, so quoting is the fix. */
const VERSION_TYPE_ERROR = "version must be quoted (e.g. version: '1.10'); unquoted, 1.10 is read as the number 1.1";

/** The rejection a `version` carries that cannot occupy the line naming it in deployed output. */
const VERSION_SHAPE_ERROR = "version must be a non-blank single line containing no '-->'";

/**
 * Frontmatter schema for a rulebook source file. The operational fields drive the resolver; unknown keys
 * (e.g. future classification metadata) are accepted but dropped, not preserved on the parsed object.
 * `delivery` is normalized to an array, and `version` is an opaque string, never parsed as semver, accepted only in
 * the shape the deployed version line can carry.
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
    // The message rides the union rather than `DeliveryModeSchema`, whose own message a union discards. `.min(1)`
    // rejects an empty list, which would otherwise parse and name no route at all.
    .union([DeliveryModeSchema, z.array(DeliveryModeSchema).min(1, DELIVERY_ERROR)], { error: DELIVERY_ERROR })
    .default('ambient')
    .transform((value) => (typeof value === 'string' ? [value] : value)),
  version: z.string({ error: VERSION_TYPE_ERROR }).refine(isRenderableVersion, VERSION_SHAPE_ERROR).optional(),
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

// region | Helpers

/** Whether a version can occupy its own `<!-- rulebook-version: ... -->` line: non-blank, one line, closing no comment. */
function isRenderableVersion(version: string): boolean {
  return version.trim() !== '' && !/[\r\n]/.test(version) && !version.includes('-->');
}

// endregion | Helpers

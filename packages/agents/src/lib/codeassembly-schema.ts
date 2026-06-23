import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** A declaration entry: a bare slug string or a `{ name }` object with tolerated unknown keys, normalized to `{ name }`. */
const EntrySchema = z
  .union([z.string(), z.object({ name: z.string() }).loose()])
  .transform((entry) => (typeof entry === 'string' ? { name: entry } : entry));

/**
 * Schema for a single grouped `codeassembly.yaml` declaration: a top-level `root` flag plus one optional block
 * per artifact category (`rulebooks`, `skills`, `subagents`, `collections`). The top level is **closed** so a
 * mistyped category (`rulebookz:`) surfaces as an error rather than being silently ignored. Entries are **open**
 * (unknown keys pass through) so reserved seams like `source` and `delivery` can be authored before the engine
 * interprets them. Each category resolves to `{ use, drop }` lists; absent or null categories drop out entirely.
 */
const CodeAssemblySchema = z
  .object({
    root: z.boolean().default(false),
    rulebooks: optionalCategory(),
    skills: optionalCategory(),
    subagents: optionalCategory(),
    collections: optionalCategory(),
  })
  .strict();

/** A parsed, validated `codeassembly.yaml` declaration from one file in the scope chain. */
export type CodeAssemblyDeclaration = z.infer<typeof CodeAssemblySchema>;

/** One category block: the artifacts this file adds (`use`) and those it subtracts from inherited tiers (`drop`). */
export type CategoryDeclaration = z.infer<ReturnType<typeof categorySchema>>;

/** A normalized declaration entry: always `{ name }`, with any unknown authoring keys preserved. */
export type DeclarationEntry = z.infer<typeof EntrySchema>;

/**
 * Parses and validates one `codeassembly.yaml` file's contents into a typed declaration. An empty or comment-only
 * file yields a declaration with `root: false` and no categories. Throws a readable error — naming `sourceLabel`
 * when provided — for malformed YAML, an unknown top-level key, a non-mapping top level, or an invalid entry.
 */
export function parseCodeAssemblyFile(raw: string, sourceLabel?: string): CodeAssemblyDeclaration {
  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid codeassembly.yaml${where}: malformed YAML — ${message}`);
  }

  // An empty or comment-only document parses to nullish; treat it as "nothing declared".
  const result = CodeAssemblySchema.safeParse(parsed ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid codeassembly.yaml${where}: ${detail}`);
  }

  return result.data;
}

// region | Helpers

/** Builds the closed `{ use, drop }` schema for one category, each list defaulting to empty. */
function categorySchema() {
  return z
    .object({
      use: z.array(EntrySchema).default([]),
      drop: z.array(EntrySchema).default([]),
    })
    .strict();
}

/**
 * Wraps a category in optional, null-tolerant handling: an absent key or a key whose value is `null` (every entry
 * commented out) resolves to `undefined`, so the category simply does not appear in the parsed declaration.
 */
function optionalCategory(): z.ZodType<CategoryDeclaration | undefined> {
  return z.preprocess((value) => value ?? undefined, categorySchema().optional());
}

// endregion | Helpers

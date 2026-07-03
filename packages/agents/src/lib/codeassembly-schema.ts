import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** A declaration entry: a bare slug string or a `{ name }` object with tolerated unknown keys, normalized to `{ name }`. */
export const EntrySchema = z
  .union([z.string(), z.object({ name: z.string() }).loose()])
  .transform((entry) => (typeof entry === 'string' ? { name: entry } : entry));

/**
 * A declared content source: a named directory structured like the library's `content/`. Both `name` and `path` are
 * required; unknown keys pass through (`.loose()`) so a later cut can add per-source config without a breaking change,
 * mirroring `EntrySchema`.
 */
export const SourceSchema = z.object({ name: z.string().min(1), path: z.string().min(1) }).loose();

/**
 * Schema for a single grouped `codeassembly.yaml` declaration: a top-level `root` flag, an optional `sources` list,
 * plus one optional block per artifact type (`rulebooks`, `skills`, `subagents`, `collections`). The top level is
 * closed (an unrecognized key triggers an error); entries are open (unknown keys pass through). Each type's block
 * resolves to `{ use, drop }` lists; an absent or null block is omitted.
 */
const CodeAssemblySchema = z
  .object({
    root: z.boolean().default(false),
    sources: optionalSourceList(),
    rulebooks: optionalTypeDeclaration(),
    skills: optionalTypeDeclaration(),
    subagents: optionalTypeDeclaration(),
    collections: optionalTypeDeclaration(),
  })
  .strict();

/** A parsed, validated `codeassembly.yaml` declaration from one file in the scope chain. */
export type CodeAssemblyDeclaration = z.infer<typeof CodeAssemblySchema>;

/** One type's block: the artifacts this file adds (`use`) and those it subtracts from inherited tiers (`drop`). */
export type TypeDeclaration = z.infer<ReturnType<typeof typeDeclarationSchema>>;

/** A normalized declaration entry: always `{ name }`, with any unknown authoring keys preserved. */
export type DeclarationEntry = z.infer<typeof EntrySchema>;

/** A declared content source as authored: a `{ name, path }` pair with any unknown keys preserved. */
export type DeclarationSource = z.infer<typeof SourceSchema>;

/**
 * Parses and validates one `codeassembly.yaml` file's contents into a typed declaration. An empty or comment-only
 * file yields a declaration with `root: false` and no type blocks. Throws a readable error, naming `sourceLabel`
 * when provided, for malformed YAML, an unknown top-level key, a non-mapping top level, or an invalid entry.
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

/** Builds the closed `{ use, drop }` schema for one type's block, each list defaulting to empty. */
function typeDeclarationSchema() {
  return z
    .object({
      use: z.array(EntrySchema).default([]),
      drop: z.array(EntrySchema).default([]),
    })
    .strict();
}

/** Resolves an absent type key, or one whose value is `null`, to `undefined` rather than a validation error. */
function optionalTypeDeclaration(): z.ZodType<TypeDeclaration | undefined> {
  return z.preprocess((value) => value ?? undefined, typeDeclarationSchema().optional());
}

/** Resolves an absent `sources` key, or one whose value is `null` (all entries commented out), to an empty list. */
function optionalSourceList(): z.ZodType<Array<DeclarationSource>> {
  return z.preprocess((value) => value ?? undefined, z.array(SourceSchema).default([]));
}

// endregion | Helpers

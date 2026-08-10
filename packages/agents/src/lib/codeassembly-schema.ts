import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { isGuidanceHookName } from './guidance-hooks.ts';
import { ALL_HARNESS_IDS } from './harness.ts';

/** A declaration entry: a bare slug string or a `{ name }` object with tolerated unknown keys, normalized to `{ name }`. */
export const EntrySchema = z
  .union([z.string(), z.object({ name: z.string() }).loose()])
  .transform((entry) => (typeof entry === 'string' ? { name: entry } : entry));

/**
 * A `harnesses` entry: an ordinary declaration entry whose name must be a known harness. Validating here rather than
 * where the block is resolved is what puts the file and the offending entry's path into the error, since only the
 * parser knows both.
 */
const HarnessEntrySchema = EntrySchema.pipe(z.object({ name: z.enum(ALL_HARNESS_IDS) }).loose());

/**
 * A declared content source: a named directory structured like the library's `content/`. Both `name` and `path` are
 * required; unknown keys pass through (`.loose()`) so a later cut can add per-source config without a breaking change,
 * mirroring `EntrySchema`.
 */
export const SourceSchema = z.object({ name: z.string().min(1), path: z.string().min(1) }).loose();

/**
 * Schema for a single grouped `codeassembly.yaml` declaration: a top-level `root` flag, an optional `home-writer`
 * path, an optional `harnesses` block naming which harnesses a sync run targets, an optional `sources` list, an
 * optional `packages` block naming installed packages that ship content, plus one optional block per artifact type
 * (`rulebooks`, `skills`, `subagents`, `collections`). The top level is closed (an unrecognized key triggers an
 * error); entries are open (unknown keys pass through). Each block resolves to `{ use, drop }` lists; an absent or
 * null block is omitted. `packages` and `harnesses` reuse that same block shape, so `use`, `drop`, and `root` apply
 * to a package name and a harness id exactly as they do to an artifact slug.
 *
 * `home-writer` sits beside `root` because it is a scalar setting about the run rather than a block naming artifacts.
 * It answers only in the home domain, where the guard on `install` and `sync --global` reads it, and a project-domain
 * file carrying it is rejected by name.
 *
 * `harnesses` sits above `sources` because it governs where a run deploys rather than which artifacts it deploys, and
 * it is the one key that resolves across the home and project domains rather than within one of them.
 *
 * `guidance-hooks` sits last because it configures the artifacts the keys above adopt rather than naming any. It is
 * the one map-valued key: each hook name owns a `{ use, drop }` block of its own, so a tier binds to one hook without
 * disturbing another.
 */
const CodeAssemblySchema = z
  .object({
    root: z.boolean().default(false),
    'home-writer': z.string().optional(),
    harnesses: optionalHarnessDeclaration(),
    sources: optionalSourceList(),
    packages: optionalTypeDeclaration(),
    rulebooks: optionalTypeDeclaration(),
    skills: optionalTypeDeclaration(),
    subagents: optionalTypeDeclaration(),
    collections: optionalTypeDeclaration(),
    'guidance-hooks': optionalGuidanceHookBindings(),
  })
  .strict();

/** A parsed, validated `codeassembly.yaml` declaration from one file in the scope chain. */
export type CodeAssemblyDeclaration = z.infer<typeof CodeAssemblySchema>;

/** Which tier pair a declaration file belongs to. Only the home pair may carry a home-domain key. */
export type DeclarationDomain = 'home' | 'project';

/** One type's block: the artifacts this file adds (`use`) and those it subtracts from inherited tiers (`drop`). */
export type TypeDeclaration = z.infer<ReturnType<typeof typeDeclarationSchema>>;

/** The `guidance-hooks` block: each hook name this file binds, mapped to that hook's own `{ use, drop }` lists. */
export type GuidanceHookBindings = z.infer<ReturnType<typeof guidanceHookBindingsSchema>>;

/** The `harnesses` block: the harnesses this file targets (`use`) and those it subtracts from inherited tiers (`drop`). */
export type HarnessDeclaration = z.infer<ReturnType<typeof harnessDeclarationSchema>>;

/** A normalized declaration entry: always `{ name }`, with any unknown authoring keys preserved. */
export type DeclarationEntry = z.infer<typeof EntrySchema>;

/** A declared content source as authored: a `{ name, path }` pair with any unknown keys preserved. */
export type DeclarationSource = z.infer<typeof SourceSchema>;

/**
 * Parses and validates one `codeassembly.yaml` file's contents into a typed declaration. An empty or comment-only
 * file yields a declaration with `root: false` and no type blocks. Throws a readable error, naming `sourceLabel`
 * when provided, for malformed YAML, an unknown top-level key, a non-mapping top level, an invalid entry, or a
 * home-domain key in a project-domain file.
 *
 * `domain` defaults to `project`, the reading under which every key is checked against the narrower legal set, so a
 * caller that omits it cannot silently admit a key that would then go unread.
 */
export function parseCodeAssemblyFile(
  raw: string,
  sourceLabel?: string,
  domain: DeclarationDomain = 'project',
): CodeAssemblyDeclaration {
  const where = sourceLabel === undefined ? '' : ` in ${sourceLabel}`;

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    throw chainError(`Invalid codeassembly.yaml${where}: malformed YAML`, error);
  }

  // An empty or comment-only document parses to nullish; treat it as "nothing declared".
  const result = CodeAssemblySchema.safeParse(parsed ?? {});
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid codeassembly.yaml${where}: ${detail}`);
  }

  if (domain === 'project' && result.data['home-writer'] !== undefined) {
    throw new Error(
      `Invalid codeassembly.yaml${where}: \`home-writer\` names the machine's home-domain writer and is read only ` +
        'from ~/.agents/codeassembly.yaml (or its .local override), so it has no effect here.',
    );
  }

  return result.data;
}

// region | Helpers

/**
 * Builds the `guidance-hooks` schema: hook name to that hook's `{ use, drop }` block. Keys are held to the grammar the
 * directive enforces, so a name no body could declare is rejected where it is written rather than going quietly unfilled.
 */
function guidanceHookBindingsSchema() {
  return z.record(
    z.string().refine(isGuidanceHookName, 'guidance-hook name must be lowercase kebab-case and letter-led'),
    typeDeclarationSchema(),
  );
}

/** Resolves an absent `guidance-hooks` key, or one whose value is `null`, to `undefined` rather than a validation error. */
function optionalGuidanceHookBindings(): z.ZodType<GuidanceHookBindings | undefined> {
  return z.preprocess((value) => value ?? undefined, guidanceHookBindingsSchema().optional());
}

/** Builds the closed `{ use, drop }` schema for the `harnesses` block, each list defaulting to empty. */
function harnessDeclarationSchema() {
  return z
    .object({
      use: z.array(HarnessEntrySchema).default([]),
      drop: z.array(HarnessEntrySchema).default([]),
    })
    .strict();
}

/** Resolves an absent `harnesses` key, or one whose value is `null`, to `undefined` rather than a validation error. */
function optionalHarnessDeclaration(): z.ZodType<HarnessDeclaration | undefined> {
  return z.preprocess((value) => value ?? undefined, harnessDeclarationSchema().optional());
}

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

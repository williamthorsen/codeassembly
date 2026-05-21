import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { isEnoent } from '../type-guards.js';
import type { KbRoot, Schema } from '../types.js';
import { defaultSchema } from './default-schema.js';

/** Relative location of the schema override file within a KB root. */
export const SCHEMA_FILE = join('.kb', 'schema.yaml');

// The on-disk `.kb/schema.yaml` shape: every field optional, so a per-KB file
// may override only the dimension it cares about.
const schemaFileShape = z.object({
  types: z.array(z.string()).optional(),
  required: z.array(z.string()).optional(),
  optional: z.array(z.string()).optional(),
});

/**
 * Load the effective schema for a KB root. Returns {@link defaultSchema}
 * verbatim when no `.kb/schema.yaml` exists; otherwise validates the override
 * and merges it under narrow-only rules (types may only be narrowed, required
 * may only be extended, optional is unioned with no required overlap).
 * Illegal overrides throw with the offending field named.
 */
export async function loadSchema(input: { kbRoot: KbRoot }): Promise<Schema> {
  const path = join(input.kbRoot.path, SCHEMA_FILE);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return defaultSchema;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: malformed YAML — ${message}`);
  }

  const result = schemaFileShape.safeParse(parsed ?? {});
  if (!result.success) {
    throw new Error(`${path}: invalid schema.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const override = result.data;
  return {
    types: override.types === undefined ? defaultSchema.types : narrowTypes(defaultSchema.types, override.types),
    required:
      override.required === undefined
        ? defaultSchema.required
        : extendRequired(defaultSchema.required, override.required),
    optional: mergeOptional(defaultSchema, override),
  };
}

/**
 * Narrow the type vocabulary: every per-KB type must already exist in the
 * defaults. Throws naming the first rogue type.
 */
export function narrowTypes(defaults: readonly string[], perKb: readonly string[]): readonly string[] {
  const allowed = new Set(defaults);
  for (const type of perKb) {
    if (!allowed.has(type)) {
      throw new Error(`schema: type "${type}" is not in the default vocabulary [${defaults.join(', ')}]`);
    }
  }
  return [...perKb];
}

/**
 * Extend the required-field set: the per-KB list must be a superset of the
 * defaults. Throws naming the first demoted (missing) default field.
 */
export function extendRequired(defaults: readonly string[], perKb: readonly string[]): readonly string[] {
  const declared = new Set(perKb);
  for (const field of defaults) {
    if (!declared.has(field)) {
      throw new Error(`schema: required field "${field}" cannot be demoted — it must remain required`);
    }
  }
  return [...perKb];
}

/**
 * Union the optional-field set with the defaults. Throws naming the first
 * field that appears in both `required` and `optional` after merge.
 */
export function extendOptional(
  defaultOptional: readonly string[],
  perKbOptional: readonly string[],
  effectiveRequired: readonly string[],
): readonly string[] {
  const merged = [...new Set([...defaultOptional, ...perKbOptional])];
  const required = new Set(effectiveRequired);
  for (const field of merged) {
    if (required.has(field)) {
      throw new Error(`schema: field "${field}" appears in both required and optional`);
    }
  }
  return merged;
}

// region | Helpers

/** Compute the effective optional list, accounting for an optional override. */
function mergeOptional(defaults: Schema, override: z.infer<typeof schemaFileShape>): readonly string[] {
  const effectiveRequired =
    override.required === undefined ? defaults.required : extendRequired(defaults.required, override.required);
  const perKbOptional = override.optional ?? [];
  return extendOptional(defaults.optional, perKbOptional, effectiveRequired);
}

// endregion | Helpers

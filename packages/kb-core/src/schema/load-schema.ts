import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { isEnoent } from '../type-guards.ts';
import type { KbRoot, KindSchema, KindsSchema, Schema } from '../types.ts';
import { defaultSchema } from './default-schema.ts';

/** Relative location of the schema override file within a KB root. */
export const SCHEMA_FILE = join('.kb', 'schema.yaml');

// Describes one type's entry under a kind: an object that may add its own `required` fields on top of the kind's
// shared spine. An empty object (`{}`) adds nothing.
const typeShape = z.object({
  required: z.array(z.string()).optional(),
});

// Describes one kind's entry under `kinds:`: a shared `required`/`optional` set, a recall policy, an `immutable`
// flag, and a `types` map whose values are always objects.
const kindShape = z.object({
  required: z.array(z.string()).optional(),
  optional: z.array(z.string()).optional(),
  recall: z.string(),
  immutable: z.boolean().optional(),
  types: z.record(z.string(), typeShape),
});

// Describes the on-disk `.kb/schema.yaml` shape.
// In legacy mode every field is optional, so a per-KB file may override only the dimension it cares about. A file that
// declares `kinds:` opts into kind-aware mode, where the declared vocabulary replaces the bundled defaults outright.
const schemaFileShape = z.object({
  types: z.array(z.string()).optional(),
  required: z.array(z.string()).optional(),
  optional: z.array(z.string()).optional(),
  kinds: z.record(z.string(), kindShape).optional(),
});

/**
 * Loads the effective schema for a KB root. Returns {@link defaultSchema} verbatim when no `.kb/schema.yaml` exists.
 *
 * A file that declares `kinds:` opts into kind-aware mode: the declared vocabulary replaces the bundled defaults
 * outright, and the flat `types`/`required`/`optional` fields are derived as the union across every kind and type. An
 * empty `kinds: {}` block is a deliberate (if degenerate) opt-in: it yields a kind-aware schema with an empty
 * vocabulary (`kinds: {}`, empty flat fields), never a silent fall-through to the legacy path.
 *
 * A file without `kinds:` runs the legacy narrow-only merge (types may only be narrowed, required may only be
 * extended, optional is unioned with no required overlap), producing byte-identical behavior to before — and leaving
 * `schema.kinds` undefined.
 *
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
  if (override.kinds !== undefined) {
    return buildKindAwareSchema(override.kinds);
  }

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
 * Resolves the effective required-field set for a record of a given `type` under a kind-aware schema: the union of the
 * owning kind's shared `required` spine and the type's own added `required` fields. Returns `undefined` when the schema
 * is legacy (no `kinds`) or the type is not declared by any kind.
 */
export function resolveRequiredForType(schema: Schema, type: string): readonly string[] | undefined {
  if (schema.kinds === undefined) {
    return undefined;
  }
  for (const kind of Object.values(schema.kinds)) {
    const typeSchema = kind.types[type];
    if (typeSchema !== undefined) {
      return [...new Set([...kind.required, ...typeSchema.required])];
    }
  }
  return undefined;
}

// region | Helpers

/**
 * Builds the effective {@link Schema} from a validated `kinds:` block. Each kind's shared `required`/`optional` and
 * each type's added `required` are normalized, then the flat `types`/`required`/`optional` fields are derived as the
 * union across every kind and type so legacy flat-field consumers keep working.
 */
function buildKindAwareSchema(rawKinds: Record<string, z.infer<typeof kindShape>>): Schema {
  const kinds: Record<string, KindSchema> = {};
  const allTypes = new Set<string>();
  const allRequired = new Set<string>();
  const allOptional = new Set<string>();

  for (const [kindName, rawKind] of Object.entries(rawKinds)) {
    const kindRequired = rawKind.required ?? [];
    const kindOptional = rawKind.optional ?? [];
    const types: Record<string, { required: readonly string[] }> = {};

    // Contribute the kind's shared spine to the flat union unconditionally, so a kind declaring no types still
    // strengthens the flat `required` validation.
    for (const field of kindRequired) {
      allRequired.add(field);
    }

    for (const [typeName, rawType] of Object.entries(rawKind.types)) {
      const typeRequired = rawType.required ?? [];
      types[typeName] = { required: typeRequired };
      allTypes.add(typeName);
      for (const field of typeRequired) {
        allRequired.add(field);
      }
    }

    for (const field of kindOptional) {
      allOptional.add(field);
    }

    kinds[kindName] = {
      required: kindRequired,
      optional: kindOptional,
      recall: rawKind.recall,
      immutable: rawKind.immutable ?? false,
      types,
    };
  }

  // A field declared optional by one kind and required by another stays required for the flat union.
  for (const field of allRequired) {
    allOptional.delete(field);
  }

  const kindsSchema: KindsSchema = kinds;
  return {
    types: [...allTypes],
    required: [...allRequired],
    optional: [...allOptional],
    kinds: kindsSchema,
  };
}

/**
 * Union the optional-field set with the defaults.
 * Throws naming the first field that appears in both `required` and `optional` after merge.
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

/**
 * Extend the required-field set: the per-KB list must be a superset of the defaults.
 * Throws naming the first demoted (missing) default field.
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

/** Computes the effective optional list, accounting for an optional override. */
function mergeOptional(defaults: Schema, override: z.infer<typeof schemaFileShape>): readonly string[] {
  const effectiveRequired =
    override.required === undefined ? defaults.required : extendRequired(defaults.required, override.required);
  const perKbOptional = override.optional ?? [];
  return extendOptional(defaults.optional, perKbOptional, effectiveRequired);
}

/**
 * Narrows the type vocabulary: every per-KB type must already exist in the defaults.
 * Throws naming the first rogue type.
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

// endregion | Helpers

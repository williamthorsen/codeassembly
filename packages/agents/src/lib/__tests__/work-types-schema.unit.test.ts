import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FLAG, type JsonSchemaDraft202012Object, registerSchema, validate } from '@hyperjump/json-schema/draft-2020-12';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { describe, expect, it } from 'vitest';

/** Recursive shape of any JSON-decoded value, matching the validator's `Json` parameter. */
type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue } | null;

/** Three levels up from this file reaches the package root (`packages/agents/`). */
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(thisDir, '../../..');

const schemaPath = path.join(packageRoot, 'schemas/work-types.schema.json');

const schema = parseJsonFile<JsonSchemaDraft202012Object>(schemaPath, 'schema');

const schemaId = schema.$id;
if (typeof schemaId !== 'string') {
  throw new TypeError(`Schema at ${schemaPath} is missing a string \`$id\` field`);
}

// Register once at module load. `registerSchema` only stores the schema in-memory keyed by `$id`;
// structural compilation (and any well-formedness errors) happens at the first `validate()` call.
// In Vitest watch mode, HMR can re-evaluate this module and re-invoke `registerSchema` with the
// same `$id`: `@hyperjump/json-schema` throws on duplicate registration. Swallow that one case
// while letting any other error propagate.
registerSchemaIdempotent(schema, schemaId);

describe('work-types.schema.json', () => {
  it('compiles as a well-formed JSON Schema', async () => {
    // `validate()` triggers compilation. A structurally invalid schema would throw `InvalidSchemaError`.
    // Validating the empty object suffices because compilation is the assertion target, not the result.
    await expect(validate(schemaId, {})).resolves.toBeDefined();
  });

  it('accepts a minimal document with one type record', async () => {
    const output = await validate(schemaId, buildMinimalDoc({ types: [buildTypeRecord()] }), FLAG);
    expect(output).toMatchObject({ valid: true });
  });

  // Each rejection case is a minimal valid document with one targeted mutation.
  it.each([
    {
      description: 'rejects an unknown top-level key',
      // Guards `additionalProperties: false` at the schema root.
      input: buildMinimalDoc({ foo: 'bar' }),
    },
    {
      description: 'rejects a type record missing a required field',
      // Guards `types[].required: ["aliases", "breakingPolicy", "description", "emoji", "key", "label", "tier"]`.
      // Builds a record without `breakingPolicy`.
      input: buildMinimalDoc({
        types: [
          {
            aliases: ['feature'],
            description: 'A change that gives consumers a new capability.',
            emoji: '🎉',
            key: 'feat',
            label: 'Features',
            tier: 'public',
          },
        ],
      }),
    },
    {
      description: 'rejects a type record missing `description`',
      // Guards `description` in `types[].required`, which every other case in this table includes.
      input: buildMinimalDoc({
        types: [
          {
            aliases: ['feature'],
            breakingPolicy: 'optional',
            emoji: '🎉',
            key: 'feat',
            label: 'Features',
            tier: 'public',
          },
        ],
      }),
    },
    {
      description: 'rejects a type record whose `description` is an empty string',
      // Guards `types[].description.minLength: 1`.
      input: buildMinimalDoc({ types: [buildTypeRecord({ description: '' })] }),
    },
    {
      description: 'rejects a type record with an unknown field',
      // Guards `types[].additionalProperties: false`.
      input: buildMinimalDoc({ types: [buildTypeRecord({ unexpected: 'field' })] }),
    },
    {
      description: 'rejects a `tier` value outside the allowed enum',
      // Guards `types[].tier.enum: ["public", "internal", "process"]`.
      input: buildMinimalDoc({ types: [buildTypeRecord({ tier: 'invalid' })] }),
    },
    {
      description: 'rejects a `breakingPolicy` value outside the allowed enum',
      // Guards `types[].breakingPolicy.enum: ["forbidden", "optional"]`.
      input: buildMinimalDoc({ types: [buildTypeRecord({ breakingPolicy: 'sometimes' })] }),
    },
    {
      description: 'rejects a `required` breaking policy',
      input: buildMinimalDoc({ types: [buildTypeRecord({ breakingPolicy: 'required' })] }),
    },
    {
      description: 'rejects a `tiers` array whose order does not match the canonical precedence',
      // Guards the `prefixItems` constraint on `tiers`. The schema pins each position via `const`,
      // so any reordering (even of the same three values) must fail validation.
      input: buildMinimalDoc({ tiers: ['process', 'internal', 'public'] }),
    },
    {
      description: 'rejects a `key` value that violates the lowercase-kebab pattern',
      // Guards `types[].key.pattern: ^[a-z][a-z0-9-]*$`. Uppercase and underscores are forbidden;
      // a single counterexample is sufficient to exercise the constraint.
      input: buildMinimalDoc({ types: [buildTypeRecord({ key: 'Feat', aliases: ['feat_fix'] })] }),
    },
    {
      description: 'rejects a `version` value that is not a bare semver',
      // Guards `version.pattern: ^\d+\.\d+\.\d+$`. The leading `v` is the canonical mistake to catch.
      input: buildMinimalDoc({ version: 'v1.0.0' }),
    },
    {
      description: 'rejects a document missing the `markers` top-level field',
      // Guards top-level `required: ["markers", "tiers", "types", "version"]`. Constructed inline
      // because `buildMinimalDoc` always supplies `markers`.
      input: {
        tiers: ['public', 'internal', 'process'],
        types: [],
        version: '1.0.0',
      },
    },
    {
      description: 'rejects a `markers` block missing the `breaking` field',
      // Guards `markers.required: ["breaking"]`.
      input: buildMinimalDoc({ markers: {} }),
    },
    {
      description: 'rejects a `markers.breaking` record missing the `emoji` field',
      // Guards `markers.breaking.required: ["emoji", "label"]`.
      input: buildMinimalDoc({ markers: { breaking: { label: 'Breaking' } } }),
    },
    {
      description: 'rejects a `markers.breaking` record missing the `label` field',
      // Guards `markers.breaking.required: ["emoji", "label"]`.
      input: buildMinimalDoc({ markers: { breaking: { emoji: '🚨' } } }),
    },
    {
      description: 'rejects a `markers.breaking.emoji` that is an empty string',
      // Guards `markers.breaking.properties.emoji.minLength: 1`.
      input: buildMinimalDoc({ markers: { breaking: { emoji: '', label: 'Breaking' } } }),
    },
    {
      description: 'rejects a `markers.breaking.label` that is an empty string',
      // Guards `markers.breaking.properties.label.minLength: 1`.
      input: buildMinimalDoc({ markers: { breaking: { emoji: '🚨', label: '' } } }),
    },
    {
      description: 'rejects an unknown field on `markers.breaking`',
      // Guards `markers.breaking.additionalProperties: false`.
      input: buildMinimalDoc({
        markers: { breaking: { emoji: '🚨', extra: 'nope', label: 'Breaking' } },
      }),
    },
  ])('$description', async ({ input }) => {
    const output = await validate(schemaId, input, FLAG);
    expect(output).toMatchObject({ valid: false });
  });
});

// region | Helpers

/**
 * Builds a minimal-but-valid `work-types.json` document, then shallow-merges in the supplied overrides.
 * Each rejection test is one constraint violation introduced via overrides; the baseline keeps every
 * other field valid so that the failure isolates to the mutation.
 */
function buildMinimalDoc(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    markers: {
      breaking: {
        emoji: '🚨',
        label: 'Breaking',
      },
    },
    tiers: ['public', 'internal', 'process'],
    types: [],
    version: '1.0.0',
    ...overrides,
  };
}

/**
 * Builds a minimal-but-valid `types[]` record, then shallow-merges in the supplied overrides.
 * Used by rejection tests that mutate one field of an otherwise-valid record.
 */
function buildTypeRecord(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    aliases: [],
    breakingPolicy: 'optional',
    description: 'A change that gives consumers a new capability.',
    emoji: '🎉',
    key: 'feat',
    label: 'Features',
    tier: 'public',
    ...overrides,
  };
}

/**
 * Reads and parses a JSON file, re-throwing read or parse errors with the file path and a label.
 * The caller-supplied `T` types the returned value at the call site without a type assertion;
 * the runtime shape is the responsibility of the caller (this is a test helper for fixture loading).
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- `T` appears only in the return position by design: Callers annotate the call site (e.g., `parseJsonFile<Schema>(...)`) so that `JSON.parse`'s `any` narrows into the desired type without a forbidden type assertion.
function parseJsonFile<T>(filePath: string, label: string): T {
  let parsed: T;
  try {
    const text = readFileSync(filePath, 'utf8');
    // `JSON.parse` returns `any`; the typed local variable narrows without a type assertion.
    parsed = JSON.parse(text);
  } catch (error) {
    throw chainError(`Failed to read or parse ${label} at ${filePath}`, error);
  }
  return parsed;
}

/**
 * Calls `registerSchema`, swallowing the duplicate-`$id` error that `@hyperjump/json-schema`
 * raises when Vitest's watch mode re-evaluates the module. Any other error propagates.
 *
 * The library does not export a typed error class for duplicate registration, so the message
 * is matched against the documented prefix from `lib/schema.js`:
 *   `A schema has already been registered for '<baseUri>`.
 */
function registerSchemaIdempotent(schemaToRegister: JsonSchemaDraft202012Object, id: string): void {
  try {
    registerSchema(schemaToRegister, id);
  } catch (error) {
    const message = describeError(error);
    const isDuplicateRegistration = message.includes('already been registered') && message.includes(id);
    if (!isDuplicateRegistration) {
      throw error;
    }
  }
}

// endregion | Helpers

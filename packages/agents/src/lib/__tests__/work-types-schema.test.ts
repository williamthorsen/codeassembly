import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { JsonSchemaDraft202012Object } from '@hyperjump/json-schema/draft-2020-12';
import { FLAG, registerSchema, validate } from '@hyperjump/json-schema/draft-2020-12';
// `BASIC` is only exported from `/experimental` in version 1.17.6 — used only on the diagnostic
// failure path below, never as part of an assertion. The stable per-dialect API is used for all
// pass/fail assertions.
import { BASIC } from '@hyperjump/json-schema/experimental';
import { describe, expect, it } from 'vitest';

/** Recursive shape of any JSON-decoded value, matching the validator's `Json` parameter. */
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

/** Shape of a single record under `types[]` — used to type the live JSON for cross-element checks. */
interface WorkTypeRecord {
  key: string;
  aliases: string[];
  tier: string;
  emoji: string;
  label: string;
  breakingPolicy: string;
  excludedFromChangelog?: boolean;
}

/** Shape of the live `work-types.json` document — used to type the live JSON for cross-element checks. */
interface WorkTypesDocument {
  version: string;
  tiers: string[];
  types: WorkTypeRecord[];
}

/**
 * The test file lives at `packages/agents/src/lib/__tests__/work-types-schema.test.ts`.
 * Three levels up reaches the package root (`packages/agents/`).
 */
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(thisDir, '../../..');

const schemaPath = path.join(packageRoot, 'schemas/work-types.schema.json');
const liveDataPath = path.join(packageRoot, 'content/skills/_data/work-types.json');

const schema = parseSchemaFile(schemaPath);

const schemaId = schema.$id;
if (typeof schemaId !== 'string') {
  throw new TypeError(`Schema at ${schemaPath} is missing a string \`$id\` field`);
}

// Register once at module load. `registerSchema` only stores the schema in-memory keyed by `$id`;
// structural compilation (and any well-formedness errors) happens at the first `validate()` call.
// In Vitest watch mode, HMR can re-evaluate this module and re-invoke `registerSchema` with the
// same `$id` — `@hyperjump/json-schema` throws on duplicate registration. Swallow that one case
// while letting any other error propagate.
registerSchemaIdempotent(schema, schemaId);

const liveData = parseLiveData(liveDataPath);

describe('work-types.schema.json', () => {
  it('compiles as a well-formed JSON Schema', async () => {
    // `validate()` triggers compilation. A structurally invalid schema would throw `InvalidSchemaError`.
    // Validating the empty object suffices because compilation is the assertion target, not the result.
    await expect(validate(schemaId, {})).resolves.toBeDefined();
  });

  it('accepts the live `content/skills/_data/work-types.json`', async () => {
    const jsonValue: JsonValue = liveDataAsJsonValue(liveData);

    const output = await validate(schemaId, jsonValue, FLAG);

    // FLAG output is the stable assertion target — it returns only `{ valid }`. On failure,
    // re-validate with `BASIC` (from `/experimental`) so the failure message includes per-keyword
    // error locations instead of an opaque `{ valid: false }`. The diagnostic is computed only
    // when the assertion fails, so the second `validate()` call is paid for only on the failure path.
    let diagnosticMessage = '';
    if (!output.valid) {
      const diagnostic = await validate(schemaId, jsonValue, BASIC);
      diagnosticMessage = `Live work-types.json failed schema validation. Diagnostic (BASIC):\n${JSON.stringify(diagnostic, null, 2)}`;
    }
    expect(output.valid, diagnosticMessage).toBe(true);
  });

  it('rejects an unknown top-level key', async () => {
    // Guards `additionalProperties: false` at the schema root. A minimal valid document with one
    // unknown top-level field is enough to exercise the constraint.
    const withExtra: JsonValue = {
      version: '1.0.0',
      tiers: ['public', 'internal', 'process'],
      types: [],
      foo: 'bar',
    };
    const output = await validate(schemaId, withExtra, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a type record missing a required field', async () => {
    // Guards `types[].required: ["key", "aliases", "tier", "emoji", "label", "breakingPolicy"]`.
    const malformed: JsonValue = {
      version: '1.0.0',
      tiers: ['public', 'internal', 'process'],
      types: [
        // Missing `breakingPolicy`.
        {
          key: 'feat',
          aliases: ['feature'],
          tier: 'public',
          emoji: '🎉',
          label: 'Features',
        },
      ],
    };
    const output = await validate(schemaId, malformed, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a type record with an unknown field', async () => {
    // Guards `types[].additionalProperties: false`.
    const malformed: JsonValue = {
      version: '1.0.0',
      tiers: ['public', 'internal', 'process'],
      types: [
        {
          key: 'feat',
          aliases: ['feature'],
          tier: 'public',
          emoji: '🎉',
          label: 'Features',
          breakingPolicy: 'optional',
          unexpected: 'field',
        },
      ],
    };
    const output = await validate(schemaId, malformed, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a `tier` value outside the allowed enum', async () => {
    // Guards `types[].tier.enum: ["public", "internal", "process"]`.
    const malformed: JsonValue = {
      version: '1.0.0',
      tiers: ['public', 'internal', 'process'],
      types: [
        {
          key: 'feat',
          aliases: [],
          tier: 'invalid',
          emoji: '🎉',
          label: 'Features',
          breakingPolicy: 'optional',
        },
      ],
    };
    const output = await validate(schemaId, malformed, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a `breakingPolicy` value outside the allowed enum', async () => {
    // Guards `types[].breakingPolicy.enum: ["forbidden", "optional", "required"]`.
    const malformed: JsonValue = {
      version: '1.0.0',
      tiers: ['public', 'internal', 'process'],
      types: [
        {
          key: 'feat',
          aliases: [],
          tier: 'public',
          emoji: '🎉',
          label: 'Features',
          breakingPolicy: 'sometimes',
        },
      ],
    };
    const output = await validate(schemaId, malformed, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('enforces unique `key` values across all type records', () => {
    // Cross-element uniqueness is asserted in-test rather than in the schema.
    const keys = liveData.types.map((entry) => entry.key);
    const duplicates = findDuplicates(keys);
    expect(duplicates, `Duplicate type keys: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('enforces globally unique `aliases` (no alias collides with another alias or any `key`)', () => {
    // Cross-element uniqueness is asserted in-test. Aliases must be globally unique and must not
    // shadow any canonical `key` — otherwise resolution from alias to canonical key is ambiguous.
    const keys = new Set(liveData.types.map((entry) => entry.key));
    const aliases = liveData.types.flatMap((entry) => entry.aliases);

    const duplicateAliases = findDuplicates(aliases);
    expect(duplicateAliases, `Duplicate aliases: ${duplicateAliases.join(', ')}`).toEqual([]);

    const aliasKeyCollisions = aliases.filter((alias) => keys.has(alias));
    expect(aliasKeyCollisions, `Aliases that collide with canonical keys: ${aliasKeyCollisions.join(', ')}`).toEqual(
      [],
    );
  });
});

// region | Helpers

/** Parses the schema JSON file, re-throwing parse errors with the file path included. */
function parseSchemaFile(filePath: string): JsonSchemaDraft202012Object {
  const text = readFileSync(filePath, 'utf8');
  let parsed: JsonSchemaDraft202012Object;
  try {
    // `JSON.parse` returns `any`; the typed local variable narrows without a type assertion.
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse schema at ${filePath}: ${message}`);
  }
  return parsed;
}

/** Reads and parses the live work-types data file, re-throwing parse errors with the file path. */
function parseLiveData(filePath: string): WorkTypesDocument {
  const text = readFileSync(filePath, 'utf8');
  let parsed: WorkTypesDocument;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse data at ${filePath}: ${message}`);
  }
  return parsed;
}

/**
 * Re-reads the live data as a `JsonValue` for validator input. Going through `JSON.parse` produces
 * an `any`-typed result that assigns into the structural `JsonValue` shape (matching the validator's
 * `Json` parameter) without a forbidden type assertion.
 */
function liveDataAsJsonValue(data: WorkTypesDocument): JsonValue {
  // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves typing; the JSON round-trip yields `any`, which assigns into `JsonValue` without a type assertion.
  const cloned: JsonValue = JSON.parse(JSON.stringify(data));
  return cloned;
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
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicateRegistration = message.includes('already been registered') && message.includes(id);
    if (!isDuplicateRegistration) {
      throw error;
    }
  }
}

/** Returns each value that appears more than once in `values`, preserving first-seen order. */
function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...duplicates];
}

// endregion | Helpers

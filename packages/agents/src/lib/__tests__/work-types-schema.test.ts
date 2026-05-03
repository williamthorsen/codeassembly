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

const schema = parseJsonFile<JsonSchemaDraft202012Object>(schemaPath, 'schema');

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

const liveData = parseJsonFile<WorkTypesDocument>(liveDataPath, 'data');

describe('work-types.schema.json', () => {
  it('compiles as a well-formed JSON Schema', async () => {
    // `validate()` triggers compilation. A structurally invalid schema would throw `InvalidSchemaError`.
    // Validating the empty object suffices because compilation is the assertion target, not the result.
    await expect(validate(schemaId, {})).resolves.toBeDefined();
  });

  it('accepts the live `content/skills/_data/work-types.json`', async () => {
    // Going through `JSON.parse` produces an `any`-typed result that assigns into the structural
    // `JsonValue` shape (matching the validator's `Json` parameter) without a forbidden type assertion.
    // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves typing; the JSON round-trip yields `any`, which assigns into `JsonValue` without a type assertion.
    const jsonValue: JsonValue = JSON.parse(JSON.stringify(liveData));

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

  // Each rejection case is a minimal valid document with one targeted mutation. Descriptions
  // identify which schema constraint is being exercised; comments at each row document the
  // specific schema rule.
  it.each([
    {
      description: 'rejects an unknown top-level key',
      // Guards `additionalProperties: false` at the schema root.
      input: buildMinimalDoc({ foo: 'bar' }),
    },
    {
      description: 'rejects a type record missing a required field',
      // Guards `types[].required: ["key", "aliases", "tier", "emoji", "label", "breakingPolicy"]`.
      // Builds a record without `breakingPolicy`.
      input: buildMinimalDoc({
        types: [
          {
            key: 'feat',
            aliases: ['feature'],
            tier: 'public',
            emoji: '🎉',
            label: 'Features',
          },
        ],
      }),
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
      // Guards `types[].breakingPolicy.enum: ["forbidden", "optional", "required"]`.
      input: buildMinimalDoc({ types: [buildTypeRecord({ breakingPolicy: 'sometimes' })] }),
    },
    {
      description: 'rejects a `tiers` array whose order does not match the canonical precedence',
      // Guards the `prefixItems` constraint on `tiers`. The schema pins each position via `const`,
      // so any reordering — even of the same three values — must fail validation.
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
      // Guards `version.pattern: ^\d+\.\d+\.\d+$`. The leading `v` is the canonical mistake to
      // catch; if the constraint were widened, this rejection test would fail loudly.
      input: buildMinimalDoc({ version: 'v1.0.0' }),
    },
  ])('$description', async ({ input }) => {
    const output = await validate(schemaId, input, FLAG);
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

  it('orders `types[]` keys in canonical render order', () => {
    // Render order is load-bearing for downstream changelog/release-notes tooling. Schema cannot
    // express a fixed-length sequence of keyed objects without verbose `prefixItems`; assert in-test.
    const canonicalOrder = [
      'feat',
      'drop',
      'deprecate',
      'fix',
      'sec',
      'perf',
      'internal',
      'refactor',
      'tests',
      'tooling',
      'ci',
      'deps',
      'ai',
      'docs',
      'fmt',
    ];
    const liveOrder = liveData.types.map((entry) => entry.key);
    expect(liveOrder).toEqual(canonicalOrder);
  });

  it('orders top-level `tiers` in canonical precedence order', () => {
    // Sanity check on top of the schema-level `prefixItems` constraint. Belt-and-braces: if the
    // schema is ever weakened, this assertion still catches a misordered live file.
    expect(liveData.tiers).toEqual(['public', 'internal', 'process']);
  });
});

// region | Helpers

/**
 * Builds a minimal-but-valid `work-types.json` document, then shallow-merges in the supplied overrides.
 * Each rejection test is one constraint violation introduced via overrides; the baseline keeps every
 * other field valid so the failure isolates to the mutation.
 */
function buildMinimalDoc(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    version: '1.0.0',
    tiers: ['public', 'internal', 'process'],
    types: [],
    ...overrides,
  };
}

/**
 * Builds a minimal-but-valid `types[]` record, then shallow-merges in the supplied overrides.
 * Used by rejection tests that mutate one field of an otherwise-valid record.
 */
function buildTypeRecord(overrides: Record<string, JsonValue> = {}): JsonValue {
  return {
    key: 'feat',
    aliases: [],
    tier: 'public',
    emoji: '🎉',
    label: 'Features',
    breakingPolicy: 'optional',
    ...overrides,
  };
}

/**
 * Reads and parses a JSON file, re-throwing read or parse errors with the file path and a label.
 * The caller-supplied `T` types the returned value at the call site without a type assertion;
 * the runtime shape is the responsibility of the caller (this is a test helper for fixture loading).
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- `T` appears only in the return position by design: callers annotate the call site (e.g., `parseJsonFile<Schema>(...)`) so that `JSON.parse`'s `any` narrows into the desired type without a forbidden type assertion.
function parseJsonFile<T>(filePath: string, label: string): T {
  let parsed: T;
  try {
    const text = readFileSync(filePath, 'utf8');
    // `JSON.parse` returns `any`; the typed local variable narrows without a type assertion.
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read or parse ${label} at ${filePath}: ${message}`);
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

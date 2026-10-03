import { readFileSync } from 'node:fs';
import path from 'node:path';

import { FLAG, type JsonSchemaDraft202012Object, registerSchema, validate } from '@hyperjump/json-schema/draft-2020-12';
// `BASIC` is exported only from `/experimental`. It serves the diagnostic failure path below, never an assertion.
import { BASIC } from '@hyperjump/json-schema/experimental';
import { describeError } from '@williamthorsen/toolbelt.errors';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { describe, expect, it } from 'vitest';

import { findDefects } from '../../src/describe-change/find-defects.ts';
import { loadTaxonomy } from '../../src/lib/work-types.ts';

/** Recursive shape of any JSON-decoded value, matching the validator's `Json` parameter. */
type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue } | null;

/** Shape of a single record under `types[]`, used to type the live JSON for cross-element checks. */
interface WorkTypeRecord {
  aliases: string[];
  breakingPolicy: string;
  description: string;
  emoji: string;
  excludedFromChangelog?: boolean;
  key: string;
  label: string;
  tier: string;
}

/** Shape of a single marker record (cross-cutting section indicator). */
interface MarkerRecord {
  emoji: string;
  label: string;
}

/** Shape of the top-level `markers` block. */
interface MarkersBlock {
  breaking: MarkerRecord;
}

/** Shape of the live `work-types.json` document, used to type the live JSON for cross-element checks. */
interface WorkTypesDocument {
  markers: MarkersBlock;
  tiers: string[];
  types: WorkTypeRecord[];
  version: string;
}

/** The live taxonomy's directory, and the schema that the tool publishes for it. */
const DATA_DIR = path.join(import.meta.dirname, '..', 'skills', '_data');
const schemaPath = path.join(import.meta.dirname, '..', '..', 'schemas', 'work-types.schema.json');
const liveDataPath = path.join(DATA_DIR, 'work-types.json');

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

const liveData = parseJsonFile<WorkTypesDocument>(liveDataPath, 'data');

describe('live work-types.json', () => {
  it('accepts the live `content/skills/_data/work-types.json`', async () => {
    // Going through `JSON.parse` produces an `any`-typed result that assigns into the structural
    // `JsonValue` shape (matching the validator's `Json` parameter) without a forbidden type assertion.
    // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves typing; the JSON round-trip yields `any`, which assigns into `JsonValue` without a type assertion.
    const jsonValue: JsonValue = JSON.parse(JSON.stringify(liveData));

    const output = await validate(schemaId, jsonValue, FLAG);

    // FLAG output is the stable assertion target; it returns only `{ valid }`. On failure,
    // re-validate with `BASIC` (from `/experimental`) so that the failure message includes per-keyword
    // error locations instead of an opaque `{ valid: false }`. The diagnostic is computed only
    // when the assertion fails, so the second `validate()` call is paid for only on the failure path.
    let diagnosticMessage = '';
    if (!output.valid) {
      const diagnostic = await validate(schemaId, jsonValue, BASIC);
      diagnosticMessage = `Live work-types.json failed schema validation. Diagnostic (BASIC):\n${JSON.stringify(diagnostic, null, 2)}`;
    }
    expect(output.valid, diagnosticMessage).toBe(true);
  });

  it('enforces unique `key` values across all type records', () => {
    // Cross-element uniqueness is asserted in-test rather than in the schema.
    const keys = liveData.types.map((entry) => entry.key);
    const duplicates = findDuplicates(keys);
    expect(duplicates, `Duplicate type keys: ${duplicates.join(', ')}`).toEqual([]);
  });

  it("enforces globally unique `aliases` (an alias doesn't collide with another alias or with any `key`)", () => {
    // Cross-element uniqueness is asserted in-test. Aliases must be globally unique and must not
    // shadow any canonical `key`; otherwise resolution from alias to canonical key is ambiguous.
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
    // Render order is load-bearing for downstream changelog/release-notes tooling, and the schema cannot express a
    // fixed-length sequence of keyed objects without verbose `prefixItems`.
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
    // Redundant with the schema-level `prefixItems` constraint: If the schema is ever weakened, this assertion still
    // catches a misordered live file.
    expect(liveData.tiers).toEqual(['public', 'internal', 'process']);
  });

  it('exposes `markers.breaking` with the canonical glyph and label', () => {
    // The `summarize-change` skill template prefixes breaking-change entries with `{emoji} **{label}:**` (e.g.
    // `🚨 **Breaking:**`) using these values directly, so a rename of either field passes schema validation and
    // breaks that consumer.
    expect(liveData.markers.breaking.emoji).toBe('🚨');
    expect(liveData.markers.breaking.label).toBe('Breaking');
  });
});

describe('the live taxonomy under the defect check', () => {
  it('reports nothing for a drop either way', async () => {
    const taxonomy = await loadTaxonomy(DATA_DIR);
    if (taxonomy === null) {
      throw new Error(`expected a readable work-types.json under ${DATA_DIR}`);
    }

    expect(findDefects({ type: 'drop' }, taxonomy)).toStrictEqual([]);
    expect(findDefects({ breaking: true, type: 'drop' }, taxonomy)).toStrictEqual([]);
  });
});

// region | Helpers

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

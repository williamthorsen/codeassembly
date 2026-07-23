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
import { parse as parseYaml } from 'yaml';

/** Recursive shape of any JSON-decoded value, matching the validator's `Json` parameter. */
type JsonValue = string | number | boolean | JsonValue[] | { [key: string]: JsonValue } | null;

/**
 * The test file lives at `packages/agents/src/lib/__tests__/preferences-schema.test.ts`.
 * Three levels up reaches the package root (`packages/agents/`); two more levels up reaches the repo root.
 */
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(thisDir, '../../..');
const repoRoot = path.resolve(packageRoot, '../..');

const schemaPath = path.join(packageRoot, 'schemas/preferences.json');
const livePreferencesPath = path.join(repoRoot, '.agents/preferences.yaml');

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

describe('preferences.json schema', () => {
  it('compiles as a well-formed JSON Schema', async () => {
    // `validate()` triggers compilation. A structurally invalid schema would throw `InvalidSchemaError`.
    // Validating the empty object suffices because compilation is the assertion target, not the result.
    await expect(validate(schemaId, {})).resolves.toBeDefined();
  });

  it('accepts the live `.agents/preferences.yaml`', async () => {
    const yamlText = readFileSync(livePreferencesPath, 'utf8');

    // `parse()` is typed `any`; the local is annotated `unknown` to keep the value opaque. Round-tripping
    // through `JSON.parse(JSON.stringify(…))` both proves the value is JSON-serializable and yields an
    // `any`-typed result that assigns to the structural `JsonValue` shape without a type assertion.
    const parsedYaml: unknown = parseYaml(yamlText);
    if (parsedYaml === undefined || parsedYaml === null) {
      throw new Error(`${livePreferencesPath} produced an empty YAML document`);
    }
    // eslint-disable-next-line unicorn/prefer-structured-clone -- structuredClone preserves `unknown`; the JSON round-trip yields `any`, which assigns into `JsonValue` (matching the validator's `Json` parameter) without a forbidden type assertion.
    const jsonValue: JsonValue = JSON.parse(JSON.stringify(parsedYaml));

    const output = await validate(schemaId, jsonValue, FLAG);

    // FLAG output is the stable assertion target — it returns only `{ valid }`. On failure,
    // re-validate with `BASIC` (from `/experimental`) so the failure message includes per-keyword
    // error locations instead of an opaque `{ valid: false }`. The diagnostic is computed only
    // when the assertion fails, so the second `validate()` call is paid for only on the failure path.
    let diagnosticMessage = '';
    if (!output.valid) {
      const diagnostic = await validate(schemaId, jsonValue, BASIC);
      diagnosticMessage = `Live preferences.yaml failed schema validation. Diagnostic (BASIC):\n${JSON.stringify(diagnostic, null, 2)}`;
    }
    expect(output.valid, diagnosticMessage).toBe(true);
  });

  it('rejects an unknown top-level key', async () => {
    // Guards `additionalProperties: false` at the schema root.
    const output = await validate(schemaId, { unknown_key: 'value' }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a `scm` value outside the allowed enum', async () => {
    // Guards the `scm` enum constraint (`github` | `bitbucket`).
    const output = await validate(schemaId, { scm: 'gitlab' }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('accepts the `scm` key and the deprecated `platform` alias', async () => {
    // The canonical `scm` key and the legacy `platform` alias both validate; the alias is retained
    // so an existing `platform`-keyed preferences file stays schema-valid during the migration window.
    const scmOutput = await validate(schemaId, { scm: 'bitbucket' }, FLAG);
    expect(scmOutput).toMatchObject({ valid: true });
    const legacyOutput = await validate(schemaId, { platform: 'bitbucket' }, FLAG);
    expect(legacyOutput).toMatchObject({ valid: true });
  });

  it('accepts the documented reserved keys under `merge`', async () => {
    // Guards `merge.strategy` and `merge.delete_branch` — recorded in the schema as reserved
    // (not yet honored by the `merge-pr` skill family) so projects can opt to set them in
    // anticipation of future support without tripping `additionalProperties`-style constraints.
    const output = await validate(
      schemaId,
      {
        merge: {
          strategy: 'squash',
          delete_branch: true,
          title_format: '[{ticket_ref} ][{scope}|{type}: ]{title}',
        },
      },
      FLAG,
    );
    expect(output).toMatchObject({ valid: true });
  });

  it('rejects an empty `commit` object missing the required `title_format`', async () => {
    // Guards the `commit.required: ["title_format"]` sub-constraint. (One sub-section is sufficient
    // to exercise the pattern; `pr` and `ticket` use the same shape.)
    const output = await validate(schemaId, { commit: {} }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects an `orchestration.approval_threshold` outside the allowed enum', async () => {
    // Guards the enum tightening on `orchestration.approval_threshold` and `budget_threshold`
    // (`none` | `low` | `medium` | `high`).
    const output = await validate(schemaId, { orchestration: { approval_threshold: 'critical' } }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a `repository.default_remote` array (old format)', async () => {
    // Guards the ticket #430 normalization from the old single-element array form to the
    // singular object form. If `default_remote` were reverted to accepting an array, this
    // test would fail.
    const output = await validate(
      schemaId,
      { repository: { default_remote: [{ name: 'origin', default_branch: 'main' }] } },
      FLAG,
    );
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects a `repository.default_remote` object missing the required `default_branch`', async () => {
    // Guards the `repository.default_remote.required: ["name", "default_branch"]` sub-constraint.
    const output = await validate(schemaId, { repository: { default_remote: { name: 'origin' } } }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects an `editors` item missing required fields', async () => {
    // Guards the `editors[].required: ["name", "command", "extensions"]` sub-constraint.
    const output = await validate(schemaId, { editors: [{ name: 'Webstorm' }] }, FLAG);
    expect(output).toMatchObject({ valid: false });
  });

  it('rejects an `integrations.<key>` object missing the required `enabled` field', async () => {
    // Guards the `integrations.additionalProperties.required: ["enabled"]` sub-constraint.
    const output = await validate(schemaId, { integrations: { jira: {} } }, FLAG);
    expect(output).toMatchObject({ valid: false });
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

// endregion | Helpers

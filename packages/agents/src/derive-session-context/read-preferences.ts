/**
 * Read `.agents/preferences.yaml` (project-local) and `~/.agents/preferences.yaml` (global),
 * merge with project-overrides-global precedence, validate against `schemas/preferences.json`,
 * and return a typed object alongside the source paths that were actually read.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { FLAG, registerSchema, validate } from '@hyperjump/json-schema/draft-2020-12';
import { parse as parseYaml } from 'yaml';

// Inline the preferences schema at bundle time. esbuild resolves the `.json` import via its built-in
// JSON loader, embedding the parsed object directly in the `.mjs`. tsx in dev mode also supports the
// import attribute, so the source-tree run works identically to the bundled run.
import preferencesSchema from '../../schemas/preferences.json' with { type: 'json' };
import type { PreferencesReadResult } from './types.ts';

/** Recursive shape of any JSON-decoded value, matching the validator's `Json` parameter. */
type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];

/**
 * Track whether the schema has been registered. `@hyperjump/json-schema` throws on duplicate
 * registration, but vitest watch mode and repeated CLI invocations within a single process both
 * re-enter this module path. The flag keeps the registration idempotent.
 */
let schemaRegistered = false;
const SCHEMA_ID: string = preferencesSchema.$id;

/**
 * Reads project and global preferences files (both optional), merges them with project values
 * winning over global, validates against `schemas/preferences.json`, and returns the typed result.
 *
 * - Missing files (project or global) are not errors — treated as empty and the other source is used.
 * - Malformed YAML throws with a message that names the offending file.
 * - Schema-validation failure throws with a message identifying the offending key path.
 */
export async function readPreferences(input: { cwd: string; home?: string }): Promise<PreferencesReadResult> {
  const home = input.home ?? homedir();
  const projectPath = path.join(input.cwd, '.agents', 'preferences.yaml');
  const globalPath = path.join(home, '.agents', 'preferences.yaml');

  const project = await readOptionalYaml(projectPath);
  const global = await readOptionalYaml(globalPath);

  const merged = mergeTopLevel(global?.value, project?.value);

  await assertValidatesAgainstSchema(merged);

  const sources: PreferencesReadResult['sources'] = {
    ...(project !== null && { project: projectPath }),
    ...(global !== null && { global: globalPath }),
  };

  return {
    preferences: merged,
    sources,
  };
}

// region | Helpers

/**
 * Read a YAML file. Returns `null` when the file does not exist (ENOENT). Throws with a
 * file-anchored message when the YAML is malformed.
 */
async function readOptionalYaml(filePath: string): Promise<{ value: unknown } | null> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoentError(error)) {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: malformed YAML — ${message}`);
  }
  // An empty document parses to `null`; treat it as "file present but empty".
  return { value: parsed ?? {} };
}

/**
 * Top-level merge of two preference objects: For each top-level key present in `project`, the
 * project value replaces the global value verbatim. Top-level keys only in `global` are retained.
 *
 * The merge is deliberately shallow (top-level only). This matches the documented contract in
 * `get-session-context/SKILL.md` ("project-level values always win" at the section level) and
 * avoids surprising deep-merge behavior for fields like `artifacts.paths`, where a project that
 * sets one path key would otherwise inherit the others from the global file.
 */
function mergeTopLevel(global: unknown, project: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (isRecord(global)) {
    for (const [key, value] of Object.entries(global)) {
      result[key] = value;
    }
  }
  if (isRecord(project)) {
    for (const [key, value] of Object.entries(project)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Registers the inlined preferences schema (idempotent) and runs validation against `merged`.
 * Throws when validation fails, with a message naming the schema ID for diagnostics.
 */
async function assertValidatesAgainstSchema(merged: Record<string, unknown>): Promise<void> {
  ensureSchemaRegistered();
  // The validator's parameter is `Json`; convert the merged record through `toJsonValue` so it
  // arrives as a fully-typed `JsonValue` shape (no `any` assertion needed at the call site).
  const jsonValue = toJsonValue(merged);
  const output = await validate(SCHEMA_ID, jsonValue, FLAG);
  if (!output.valid) {
    throw new Error(
      `preferences failed schema validation against ${SCHEMA_ID}. ` +
        `Check the contents of .agents/preferences.yaml (or the global ~/.agents/preferences.yaml).`,
    );
  }
}

/**
 * Registers the inlined schema if not already registered. The library throws on duplicate
 * registration, so the catch swallows that one case and lets any other error propagate. The
 * library does not export a typed duplicate-error class; the message text is matched instead.
 */
function ensureSchemaRegistered(): void {
  if (schemaRegistered) {
    return;
  }
  try {
    registerSchema(preferencesSchema, SCHEMA_ID);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicateRegistration = message.includes('already been registered') && message.includes(SCHEMA_ID);
    if (!isDuplicateRegistration) {
      throw error;
    }
  }
  schemaRegistered = true;
}

/** Narrows `value` to a plain object with unknown property values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `error` carries the Node `ENOENT` errno. */
function isEnoentError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === 'ENOENT';
}

/**
 * Recursively converts an arbitrary JSON-compatible value (e.g., the output of `JSON.parse` or
 * `yaml.parse`) into the structural `JsonValue` shape. Throws if a non-JSON value (function,
 * symbol, `undefined`, `bigint`) is encountered — none of these can occur in valid YAML or JSON,
 * so the throw is a defensive guard rather than an expected path.
 */
function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }
  if (isRecord(value)) {
    const result: { [key: string]: JsonValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry);
    }
    return result;
  }
  throw new TypeError(`unexpected non-JSON value of type ${typeof value}`);
}

// endregion | Helpers

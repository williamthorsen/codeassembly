import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { AUDIENCE_VALUES, MATURITY_VALUES, readProjectStage, SENSITIVITY_VALUES } from '../read-project-stage.ts';

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../schemas/preferences.v1.json');

describe(readProjectStage, () => {
  it('returns every value as null when the file does not have a `project` section', () => {
    expect(readProjectStage({})).toEqual({ maturity: null, sensitivity: null, audience: null });
  });

  it('returns the declared values and null for each undeclared one', () => {
    expect(readProjectStage({ project: { slug: 'x', maturity: 'early', sensitivity: 'personal' } })).toEqual({
      maturity: 'early',
      sensitivity: 'personal',
      audience: null,
    });
  });

  it('throws on a value outside its set, naming the key path and the allowed values', () => {
    expect(() => readProjectStage({ project: { audience: 'everyone' } })).toThrow(
      `preferences: 'project.audience' must be one of "owner", "team", "public" (got "everyone")`,
    );
  });

  it('throws when `project` is not an object', () => {
    expect(() => readProjectStage({ project: 'x' })).toThrow(/'project' must be an object/);
  });

  it('accepts exactly the values that the preferences schema declares', () => {
    const projectProperties = readSchemaProjectProperties();
    expect(MATURITY_VALUES).toEqual(projectProperties['maturity']);
    expect(SENSITIVITY_VALUES).toEqual(projectProperties['sensitivity']);
    expect(AUDIENCE_VALUES).toEqual(projectProperties['audience']);
  });
});

// region | Helpers

/** Reads the `enum` of each stage key under the schema's `project.properties`. */
function readSchemaProjectProperties(): Record<string, unknown> {
  const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const properties = readPath(schema, ['properties', 'project', 'properties']);
  const result: Record<string, unknown> = {};
  for (const key of ['maturity', 'sensitivity', 'audience']) {
    result[key] = readPath(properties, [key, 'enum']);
  }
  return result;
}

/** Follows `keys` through nested objects, returning `undefined` at the first missing step. */
function readPath(value: unknown, keys: readonly string[]): unknown {
  let current = value;
  for (const key of keys) {
    current = isRecord(current) ? current[key] : undefined;
  }
  return current;
}

// endregion | Helpers

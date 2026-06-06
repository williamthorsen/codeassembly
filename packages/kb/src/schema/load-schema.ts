import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { KbLoaderError } from '../config/kb-loader-error.ts';
import { isEnoent } from '../type-guards.ts';
import type { KbRoot, RecordTypeSchema, RecordTypesSchema, Schema } from '../types.ts';
import { defaultSchema } from './default-schema.ts';

/** Relative location of the schema override file within a KB root. */
export const SCHEMA_FILE = join('.kb', 'schema.yaml');

// Describes one record type's entry under `recordTypes:`: a `required`/`optional` field set, a recall policy, and an
// optional `immutable` flag.
const recordTypeShape = z.object({
  required: z.array(z.string()).optional(),
  optional: z.array(z.string()).optional(),
  recall: z.string(),
  immutable: z.boolean().optional(),
});

// Describes the on-disk `.kb/schema.yaml` shape: a single `recordTypes:` block keyed by record-type name. A store that
// declares `recordTypes:` replaces the bundled default outright.
const schemaFileShape = z.object({
  recordTypes: z.record(z.string(), recordTypeShape),
});

/**
 * Loads the effective schema for a KB root. Returns {@link defaultSchema} verbatim when no `.kb/schema.yaml` exists.
 *
 * A `.kb/schema.yaml` declares a `recordTypes:` block keyed by record-type name; the declared vocabulary replaces the
 * bundled default outright. A file still using the retired `kinds:` (or flat `types:`) shape is rejected with a named
 * {@link KbLoaderError}.
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
    throw new KbLoaderError(`${path}: malformed YAML — ${message}`);
  }

  const result = schemaFileShape.safeParse(parsed ?? {});
  if (!result.success) {
    throw new KbLoaderError(`${path}: invalid schema.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  return buildSchema(result.data.recordTypes);
}

/**
 * Resolves the required-field set for a given `recordType`: that record type's `required` array verbatim, or
 * `undefined` when the record type is not declared by the schema. The implicit `recordType` discriminant is never part
 * of the returned set.
 */
export function resolveRequiredForRecordType(schema: Schema, recordType: string): readonly string[] | undefined {
  return schema.recordTypes[recordType]?.required;
}

// region | Helpers

/** Builds the effective {@link Schema} from a validated `recordTypes:` block, normalizing each record type's fields. */
function buildSchema(rawRecordTypes: Record<string, z.infer<typeof recordTypeShape>>): Schema {
  const recordTypes: Record<string, RecordTypeSchema> = {};
  for (const [name, raw] of Object.entries(rawRecordTypes)) {
    recordTypes[name] = {
      required: raw.required ?? [],
      optional: raw.optional ?? [],
      recall: raw.recall,
      immutable: raw.immutable ?? false,
    };
  }
  const schema: RecordTypesSchema = recordTypes;
  return { recordTypes: schema };
}

// endregion | Helpers

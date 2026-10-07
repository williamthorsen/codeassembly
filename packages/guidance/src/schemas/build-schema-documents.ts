import { readFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from '../lib/type-guards.ts';

/** The published schemas, each named `<subject>.v<major>.json`. */
export const SCHEMA_FILE_NAMES = ['preferences.v1.json', 'work-types.v1.json'] as const;

/** One published schema: the file to write and its content. */
export interface SchemaDocument {
  readonly fileName: string;
  readonly document: Record<string, unknown>;
}

/**
 * Builds each published schema from its source in this directory, stamped with the `$id` of the npm release
 * at `version`.
 */
export function buildSchemaDocuments(version: string): SchemaDocument[] {
  return SCHEMA_FILE_NAMES.map((fileName) => {
    const source = readSchemaSource(fileName);
    const { $schema, $id: _sourceId, ...body } = source;
    return { fileName, document: { $schema, $id: buildSchemaUrl(fileName, version), ...body } };
  });
}

/**
 * Builds the URL at which `fileName` is served from the npm release at `version`.
 *
 * A release never changes, so the URL names one schema permanently; a later release that ships the same
 * major version carries it under its own URL.
 */
export function buildSchemaUrl(fileName: string, version: string): string {
  return `https://unpkg.com/codeassembly-guidance@${version}/schemas/${fileName}`;
}

// region | Helpers

/** Reads and parses the source of the schema `fileName`. */
function readSchemaSource(fileName: string): Record<string, unknown> {
  const filePath = path.join(import.meta.dirname, fileName);
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isRecord(parsed)) {
    throw new TypeError(`Schema source at ${filePath} is not a JSON object`);
  }
  return parsed;
}

// endregion | Helpers

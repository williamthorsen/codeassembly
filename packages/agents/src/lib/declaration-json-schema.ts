import { z } from 'zod';

import { CodeAssemblySchema } from './codeassembly-schema.ts';

/** The published schema's file name, `<subject>.v<major>.json`. */
export const DECLARATION_SCHEMA_FILE_NAME = 'codeassembly.v1.json';

/**
 * Builds the JSON Schema for a `codeassembly.yaml` declaration, stamped with the `$id` of the npm release at
 * `version`. It describes what an author writes, before the parser's transforms and defaults run.
 */
export function buildDeclarationSchema(version: string): Record<string, unknown> {
  const { $schema, ...body } = z.toJSONSchema(CodeAssemblySchema, { io: 'input' });
  return { $schema, $id: buildDeclarationSchemaUrl(version), title: 'CodeAssembly declaration', ...body };
}

/**
 * Builds the URL at which the schema is served from the npm release at `version`. A release never changes, so the
 * URL names one schema permanently.
 */
export function buildDeclarationSchemaUrl(version: string): string {
  return `https://unpkg.com/codeassembly@${version}/schemas/${DECLARATION_SCHEMA_FILE_NAME}`;
}

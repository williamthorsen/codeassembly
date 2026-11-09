import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { agentLogicConfigSchema } from './agent-logic-schema.ts';

/** Location of the committed JSON Schema file. */
export const JSON_SCHEMA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schema/agent-logic.schema.json',
);

/** Renders the agent-logic schema as the text of a JSON Schema file, describing what a producer writes. */
export function renderJsonSchema(): string {
  return `${JSON.stringify(z.toJSONSchema(agentLogicConfigSchema, { io: 'input' }), undefined, 2)}\n`;
}

if (import.meta.main) {
  writeFileSync(JSON_SCHEMA_PATH, renderJsonSchema());
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isRecord } from '../src/lib/type-guards.ts';
import { buildSchemaDocuments } from '../src/schemas/build-schema-documents.ts';

// Write the published schemas into `schemas/`, stamped with this package's version.
const packageRoot = path.resolve(import.meta.dirname, '..');
const packageJson: unknown = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const version = isRecord(packageJson) ? packageJson.version : undefined;
if (typeof version !== 'string') {
  throw new TypeError(`package.json in ${packageRoot} does not declare a string version`);
}

const outputDir = path.join(packageRoot, 'schemas');
mkdirSync(outputDir, { recursive: true });
for (const { fileName, document } of buildSchemaDocuments(version)) {
  writeFileSync(path.join(outputDir, fileName), JSON.stringify(document, undefined, 2) + '\n', 'utf8');
}

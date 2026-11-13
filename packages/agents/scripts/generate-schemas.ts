import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildDeclarationSchema, DECLARATION_SCHEMA_FILE_NAME } from '../src/lib/declaration-json-schema.ts';
import { readPackageVersion } from '../src/lib/package-version.ts';

// Write the published schema into `schemas/`, stamped with this package's version.
const outputDir = path.resolve(import.meta.dirname, '..', 'schemas');
mkdirSync(outputDir, { recursive: true });
writeFileSync(
  path.join(outputDir, DECLARATION_SCHEMA_FILE_NAME),
  `${JSON.stringify(buildDeclarationSchema(readPackageVersion()), undefined, 2)}\n`,
  'utf8',
);

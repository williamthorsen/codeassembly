import { writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildWorkTypesDocument,
  checkWorkTypesFile,
  serializeWorkTypesDocument,
} from '../src/lib/build-work-types-document.ts';

// Write the deployed taxonomy from the change-grammar package, or with `--check` refuse a committed copy that differs.
const outputPath = path.resolve(import.meta.dirname, '..', 'content', 'skills', '_data', 'work-types.json');
const document = buildWorkTypesDocument();

if (process.argv.includes('--check')) {
  const state = await checkWorkTypesFile(outputPath, document);
  if (state !== 'current') {
    console.error(
      `Error: ${outputPath} is ${state}. Regenerate it with \`node packages/guidance/scripts/generate-work-types.ts\`.`,
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, serializeWorkTypesDocument(document), 'utf8');
}

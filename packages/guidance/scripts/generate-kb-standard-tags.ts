import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildKbStandardTagsPartial, checkKbStandardTagsPartial } from '../src/lib/build-kb-standard-tags-partial.ts';

// Write the standard-tags partial from the kb package, or with `--check` refuse a committed copy that differs.
const outputPath = path.resolve(import.meta.dirname, '..', 'content', '_partials', 'kb-standard-tags.md');
const content = buildKbStandardTagsPartial();

if (process.argv.includes('--check')) {
  const state = await checkKbStandardTagsPartial(outputPath, content);
  if (state !== 'current') {
    console.error(
      `Error: ${outputPath} is ${state}. Regenerate it with \`node packages/guidance/scripts/generate-kb-standard-tags.ts\`.`,
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputPath, content, 'utf8');
}

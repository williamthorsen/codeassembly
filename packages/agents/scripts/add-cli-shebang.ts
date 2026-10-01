/**
 * Post-compile build step: Adds a shebang to the CLI entry point and makes it executable.
 */
import { chmod, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(thisFile), '..');

const cliEntry = path.join(packageRoot, 'dist', 'esm', 'cli.js');

console.info('Adding shebang to dist/esm/cli.js...');
// `nmr compile` caches on source hashes outside `dist/`, so a build can report success with `dist/esm/` absent.
// Reading the entry point fails the build in that case.
const cliContent = await readFile(cliEntry, 'utf8');
if (!cliContent.startsWith('#!/')) {
  await writeFile(cliEntry, `#!/usr/bin/env node\n${cliContent}`, 'utf8');
}

await chmod(cliEntry, 0o755);
console.info('  Done.');

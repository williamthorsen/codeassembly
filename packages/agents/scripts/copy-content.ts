/**
 * Post-compile build step: copies content/ to dist/content/ and adds a shebang to the CLI entry point.
 */
import { chmod, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(thisFile), '..');

const contentSrc = path.join(packageRoot, 'content');
const contentDest = path.join(packageRoot, 'dist', 'content');
const cliEntry = path.join(packageRoot, 'dist', 'esm', 'cli.js');

// 1. Copy content/ to dist/content/
console.info('Copying content/ to dist/content/...');
await mkdir(path.dirname(contentDest), { recursive: true });
await cp(contentSrc, contentDest, { recursive: true });
console.info('  Done.');

// 2. Prepend shebang to dist/esm/cli.js
console.info('Adding shebang to dist/esm/cli.js...');
const cliContent = await readFile(cliEntry, 'utf8');
if (!cliContent.startsWith('#!/')) {
  await writeFile(cliEntry, `#!/usr/bin/env node\n${cliContent}`, 'utf8');
}

// 3. Set executable permissions
await chmod(cliEntry, 0o755);
console.info('  Done.');

/**
 * Post-compile build step: copies content/ to dist/content/ and adds a shebang to the CLI entry point.
 */
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(thisFile), '..');

const contentSrc = path.join(packageRoot, 'content');
const contentDest = path.join(packageRoot, 'dist', 'content');
const cliEntry = path.join(packageRoot, 'dist', 'esm', 'cli.js');

/**
 * Reports whether `source` belongs in the built content tree. Excludes dotfiles, and any `__tests__` directory: the
 * build output is what the package publishes, so a test directory anywhere under `content/` would otherwise ship to
 * every consumer. `cp` skips a rejected directory's whole subtree, so rejecting the directory is enough.
 */
function shouldCopy(source: string): boolean {
  const name = path.basename(source);
  return !name.startsWith('.') && name !== '__tests__';
}

// 1. Copy content/ to dist/content/
console.info('Copying content/ to dist/content/...');
// Discard the previous copy first: `cp` overwrites but never deletes, so anything since removed from `content/` --
// or newly excluded by `shouldCopy` -- would survive in the build output and ship to every consumer.
await rm(contentDest, { force: true, recursive: true });
await mkdir(path.dirname(contentDest), { recursive: true });
await cp(contentSrc, contentDest, { recursive: true, filter: shouldCopy });
console.info('  Done.');

// 2. Prepend shebang to dist/esm/cli.js
console.info('Adding shebang to dist/esm/cli.js...');
// This read is unconditional by design. `nmr compile` keeps its content-hash cache outside `dist/`, so deleting
// `dist/` alone does not force a rebuild; an absent entry point throws here and fails the build, which is what stops
// a skipped compile from publishing a tarball whose bin dies at its own gate. Guarding the read would silence that.
const cliContent = await readFile(cliEntry, 'utf8');
if (!cliContent.startsWith('#!/')) {
  await writeFile(cliEntry, `#!/usr/bin/env node\n${cliContent}`, 'utf8');
}

// 3. Set executable permissions
await chmod(cliEntry, 0o755);
console.info('  Done.');

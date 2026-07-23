import { existsSync } from 'node:fs';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the absolute path to the `content/` directory.
 *
 * The module file is at `src/lib/content-resolver.ts` (dev) or `dist/esm/lib/content-resolver.js` (built).
 * In both cases, two levels up reaches the directory containing `content/`:
 * - Dev: `src/lib/` -> package root -> `content/`
 * - Built: `dist/esm/lib/` -> `dist/` -> `dist/content/`
 */
export function resolveContentDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Works for both dev (src/lib/) and built (dist/esm/lib/):
  // two levels up lands at the package root (dev) or dist/ (built),
  // both of which contain a content/ subdirectory.
  const primaryPath = path.resolve(thisDir, '../../content');
  if (existsSync(primaryPath)) {
    return primaryPath;
  }

  // Fallback for unexpected nesting
  const fallbackPath = path.resolve(thisDir, '../../../content');
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  throw new Error(`Could not locate content directory. Searched:\n  ${primaryPath}\n  ${fallbackPath}`);
}

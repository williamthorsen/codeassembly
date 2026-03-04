import { readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Recursively walk `dir` looking for any `.ts` file with `mtimeMs > referenceMs`.
 * Short-circuits on first match.
 */
async function hasNewerFile(dir: string, referenceMs: number): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await hasNewerFile(fullPath, referenceMs)) {
        return true;
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const fileStat = await stat(fullPath);
      if (fileStat.mtimeMs > referenceMs) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check whether source files are newer than compiled output.
 *
 * Resolves the package root from the compiled file location (`dist/esm/`),
 * then compares `src/**\/*.ts` mtimes against `dist/esm/cli.js`.
 *
 * Returns `false` (not stale) when:
 * - `src/` doesn't exist (published package, not dev)
 * - `cli.js` can't be stat'd
 * - Any error occurs (fail-safe)
 *
 * @param compiledFileUrl - URL of a file inside `dist/esm/`. Defaults to `import.meta.url`.
 *   The optional parameter makes this testable without mocking `import.meta.url`.
 */
export async function isBuildStale(compiledFileUrl?: string): Promise<boolean> {
  try {
    const compiledFilePath = fileURLToPath(compiledFileUrl ?? import.meta.url);
    const packageRoot = resolve(dirname(compiledFilePath), '../..');
    const srcDir = join(packageRoot, 'src');

    // If src/ doesn't exist, this is a published package -- not stale
    try {
      await stat(srcDir);
    } catch {
      return false;
    }

    // Get the reference mtime from the sentinel file
    const sentinelPath = join(packageRoot, 'dist', 'esm', 'cli.js');
    const sentinelStat = await stat(sentinelPath);
    const referenceMs = sentinelStat.mtimeMs;

    return await hasNewerFile(srcDir, referenceMs);
  } catch {
    // Fail-safe: never block tool execution
    return false;
  }
}

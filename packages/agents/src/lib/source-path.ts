import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Resolves a declared source's authored `path` to an absolute directory, against `fileDir` — the `.agents/` directory
 * of the file that declared it. A leading `~` (or `~/…`) expands to the home directory, an already-absolute path is
 * returned unchanged, and a relative path resolves against `fileDir`.
 */
export function resolveSourcePath(rawPath: string, fileDir: string): string {
  if (rawPath === '~' || rawPath.startsWith('~/')) {
    return path.join(homedir(), rawPath.slice(1));
  }
  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }
  return path.resolve(fileDir, rawPath);
}

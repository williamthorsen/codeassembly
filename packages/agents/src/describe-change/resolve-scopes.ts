import path from 'node:path';

import { getWorkspacePackageDirs, isMonorepoRoot } from '@williamthorsen/nmr/workspace';

/**
 * Discovers the workspace directories that `projectRoot` declares, as absolute paths.
 *
 * A root that declares no pnpm workspace has none, as in a repository on another package manager. Its scopes are then
 * the directories that it declares, if any.
 */
export function discoverWorkspaceDirs(projectRoot: string): string[] {
  return isMonorepoRoot(projectRoot) ? getWorkspacePackageDirs(projectRoot) : [];
}

/**
 * Combines the package directories, each named by its basename, with the declared scope directories. A declared
 * directory that is also a package directory replaces the package's entry, so its declared name wins.
 */
export function mergeScopeDirs(input: {
  declaredDirs: readonly ScopeDir[];
  packageDirs: readonly string[];
}): ScopeDir[] {
  const byDir = new Map<string, ScopeDir>();
  for (const dir of input.packageDirs) {
    byDir.set(dir, { dir, name: path.basename(dir) });
  }
  for (const scopeDir of input.declaredDirs) {
    byDir.set(scopeDir.dir, scopeDir);
  }
  return byDir.values().toArray();
}

/**
 * Maps each given path to the scope that owns it: the name of the longest scope directory containing it, or `root` for
 * a path outside every scope directory. A path is resolved against `projectRoot`, so an absolute path and a
 * root-relative one resolve alike.
 */
export function resolveScopes(input: {
  paths: readonly string[];
  projectRoot: string;
  scopeDirs: readonly ScopeDir[];
}): ScopeResolution {
  const pathScopes: Record<string, string> = {};
  for (const givenPath of input.paths) {
    pathScopes[givenPath] = resolveScope(givenPath, input.projectRoot, input.scopeDirs);
  }
  return { pathScopes, scopes: new Set(Object.values(pathScopes)).values().toArray().toSorted() };
}

/** A directory that owns a scope, as an absolute path, and the name of that scope. */
export interface ScopeDir {
  dir: string;
  name: string;
}

/** Every given path's scope, and the sorted set of the scopes that they name between them. */
export interface ScopeResolution {
  pathScopes: Record<string, string>;
  scopes: string[];
}

// region | Helpers

/** The scope of a path that no scope directory contains. */
const ROOT_SCOPE = 'root';

/** Resolves one path's scope, preferring the longest scope directory that contains it so a nested one wins. */
function resolveScope(givenPath: string, projectRoot: string, scopeDirs: readonly ScopeDir[]): string {
  const absolute = path.resolve(projectRoot, givenPath);

  let owner: ScopeDir | undefined;
  for (const scopeDir of scopeDirs) {
    const { dir } = scopeDir;
    const contains = absolute === dir || absolute.startsWith(`${dir}${path.sep}`);
    if (contains && (owner === undefined || dir.length > owner.dir.length)) {
      owner = scopeDir;
    }
  }
  return owner?.name ?? ROOT_SCOPE;
}

// endregion | Helpers

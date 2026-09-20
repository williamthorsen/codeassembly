import path from 'node:path';

import { getWorkspacePackageDirs, isMonorepoRoot } from '@williamthorsen/nmr/workspace';

/**
 * Discovers the workspace directories that `projectRoot` declares, as absolute paths.
 *
 * A root that declares no pnpm workspace has none, and every path under it then resolves to the root scope. This is
 * the case in a repository on another package manager, where the subcommand reports one scope throughout.
 */
export function discoverWorkspaceDirs(projectRoot: string): string[] {
  return isMonorepoRoot(projectRoot) ? getWorkspacePackageDirs(projectRoot) : [];
}

/**
 * Maps each given path to the scope that owns it: the basename of the longest workspace directory containing it, or
 * `root` for a path outside every workspace. A path is resolved against `projectRoot`, so an absolute path and a
 * root-relative one resolve alike.
 */
export function resolveScopes(input: {
  paths: readonly string[];
  projectRoot: string;
  workspaceDirs: readonly string[];
}): ScopeResolution {
  const pathScopes: Record<string, string> = {};
  for (const givenPath of input.paths) {
    pathScopes[givenPath] = resolveScope(givenPath, input.projectRoot, input.workspaceDirs);
  }
  return { pathScopes, scopes: new Set(Object.values(pathScopes)).values().toArray().toSorted() };
}

/** Every given path's scope, and the sorted set of the scopes that they name between them. */
export interface ScopeResolution {
  pathScopes: Record<string, string>;
  scopes: string[];
}

// region | Helpers

/** The scope of a path that no workspace directory contains. */
const ROOT_SCOPE = 'root';

/** Resolves one path's scope, preferring the longest workspace directory that contains it so a nested one wins. */
function resolveScope(givenPath: string, projectRoot: string, workspaceDirs: readonly string[]): string {
  const absolute = path.resolve(projectRoot, givenPath);

  let owner: string | undefined;
  for (const dir of workspaceDirs) {
    const contains = absolute === dir || absolute.startsWith(`${dir}${path.sep}`);
    if (contains && (owner === undefined || dir.length > owner.length)) {
      owner = dir;
    }
  }
  return owner === undefined ? ROOT_SCOPE : path.basename(owner);
}

// endregion | Helpers

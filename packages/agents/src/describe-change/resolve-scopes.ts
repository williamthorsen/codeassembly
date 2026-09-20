import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { glob } from 'glob';
import { parse as parseYaml } from 'yaml';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';

/**
 * Discovers the workspace directories that `projectRoot` declares, as root-relative posix paths in sorted order.
 *
 * Reproduces release-kit's `discoverWorkspaces()`: resolve `pnpm-workspace.yaml`'s `packages` globs against the root,
 * then keep the matches holding a `package.json`. A root that declares no workspace file, no `packages` list, or a list
 * resolving to nothing yields no directories, and every path then resolves to the root scope.
 */
export async function discoverWorkspaceDirs(projectRoot: string): Promise<string[]> {
  const patterns = await readPackagePatterns(path.join(projectRoot, WORKSPACE_FILE));
  const directories = new Set<string>();
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd: projectRoot, posix: true });
    for (const match of matches) {
      if (existsSync(path.join(projectRoot, match, 'package.json'))) {
        directories.add(match);
      }
    }
  }
  return [...directories].sort();
}

/**
 * Maps each given path to the scope that owns it: the basename of the longest workspace directory containing it, or
 * `root` for a path outside every workspace. A path is read relative to `projectRoot`, so an absolute path and a
 * root-relative one resolve alike, and a path outside the root resolves to the root scope.
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
  return { pathScopes, scopes: [...new Set(Object.values(pathScopes))].sort() };
}

/** Every given path's scope, and the sorted set of the scopes that they name between them. */
export interface ScopeResolution {
  pathScopes: Record<string, string>;
  scopes: string[];
}

// region | Helpers

/** The scope of a path that no workspace directory contains. */
const ROOT_SCOPE = 'root';

/** The workspace declaration that the discovery reads, relative to the project root. */
const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/** Reads the `packages` globs that a workspace file declares; a missing file or a malformed list declares none. */
async function readPackagePatterns(workspaceFile: string): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(workspaceFile, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }

  const parsed: unknown = parseYaml(content);
  if (!isRecord(parsed) || !Array.isArray(parsed.packages)) {
    return [];
  }
  return parsed.packages.filter((pattern) => typeof pattern === 'string');
}

/** Resolves one path's scope, preferring the longest workspace directory that contains it so a nested one wins. */
function resolveScope(givenPath: string, projectRoot: string, workspaceDirs: readonly string[]): string {
  const relative = path.relative(projectRoot, path.resolve(projectRoot, givenPath)).split(path.sep).join('/');
  if (relative === '' || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return ROOT_SCOPE;
  }

  let owner: string | undefined;
  for (const dir of workspaceDirs) {
    const contains = relative === dir || relative.startsWith(`${dir}/`);
    if (contains && (owner === undefined || dir.length > owner.length)) {
      owner = dir;
    }
  }
  return owner === undefined ? ROOT_SCOPE : path.posix.basename(owner);
}

// endregion | Helpers

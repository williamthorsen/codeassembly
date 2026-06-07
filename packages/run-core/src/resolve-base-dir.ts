import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { isRecord } from './type-guards.js';

/**
 * Expand a leading `~/` prefix to the home directory.
 */
function expandTilde(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}

function resolveValue(value: string, projectRoot: string, home: string): string {
  const expanded = expandTilde(value, home);
  return isAbsolute(expanded) ? expanded : resolve(projectRoot, expanded);
}

/**
 * Read `artifacts.base_dir` from a YAML preferences file.
 * Returns the value if it exists and is a string, or `undefined` otherwise.
 * Missing files (ENOENT) are silently skipped. Other I/O errors (e.g., EACCES)
 * emit a warning to stderr and fall back to `undefined`.
 */
async function readBaseDirFromYaml(filePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed: unknown = parseYaml(content);
    if (!isRecord(parsed)) {
      return undefined;
    }
    const artifacts: unknown = parsed.artifacts;
    if (!isRecord(artifacts)) {
      return undefined;
    }
    const baseDir: unknown = artifacts.base_dir;
    if (typeof baseDir !== 'string') {
      return undefined;
    }
    return baseDir;
  } catch (error: unknown) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return undefined;
    }
    process.stderr.write(
      `Warning: failed to read preferences file ${filePath}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return undefined;
  }
}

export interface ResolveBaseDirOptions {
  /** Override the home directory (used for testing). */
  home?: string | undefined;
}

/**
 * Resolve the artifact base directory using a preference cascade:
 *
 * 1. Explicit `baseDir` argument (absolute used as-is; relative resolved from `projectRoot`)
 * 2. `artifacts.base_dir` from `{projectRoot}/.agents/preferences.yaml`
 * 3. `artifacts.base_dir` from `~/.agents/preferences.yaml`
 * 4. Default: `~/.ai`
 */
export async function resolveBaseDir(
  projectRoot: string,
  baseDir?: string,
  options?: ResolveBaseDirOptions,
): Promise<string> {
  const home = options?.home ?? homedir();

  // 1. Explicit override
  if (baseDir !== undefined) {
    return resolveValue(baseDir, projectRoot, home);
  }

  // 2. Project-level preferences
  const projectPrefs = join(projectRoot, '.agents', 'preferences.yaml');
  const projectValue = await readBaseDirFromYaml(projectPrefs);
  if (projectValue !== undefined) {
    return resolveValue(projectValue, projectRoot, home);
  }

  // 3. Global preferences
  const globalPrefs = join(home, '.agents', 'preferences.yaml');
  const globalValue = await readBaseDirFromYaml(globalPrefs);
  if (globalValue !== undefined) {
    return resolveValue(globalValue, projectRoot, home);
  }

  // 4. Default
  return join(home, '.ai');
}

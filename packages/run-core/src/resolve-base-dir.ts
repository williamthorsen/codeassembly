import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { parse as parseYaml } from 'yaml';

import { isRecord } from './type-guards.ts';

/** Expands `~` or a leading `~/` to the home directory. */
function expandTilde(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}

/** Expands a tilde, then resolves a relative path against `projectRoot`. */
function resolveValue(value: string, projectRoot: string, home: string): string {
  const expanded = expandTilde(value, home);
  return isAbsolute(expanded) ? expanded : resolve(projectRoot, expanded);
}

/**
 * Reads `artifacts.base_dir` from a YAML preferences file.
 * Returns the value if it exists and is a string, or `undefined` otherwise.
 * Returns `undefined` without a warning when the file is missing (ENOENT). On any other
 * failure, such as EACCES or malformed YAML, writes a warning to stderr and returns `undefined`.
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
    process.stderr.write(`Warning: failed to read preferences file ${filePath}: ${describeError(error)}\n`);
    return undefined;
  }
}

export interface ResolveBaseDirOptions {
  /** Overrides the home directory (used for testing). */
  home?: string | undefined;
}

/**
 * Resolves the artifact base directory using a preference cascade:
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

  if (baseDir !== undefined) {
    return resolveValue(baseDir, projectRoot, home);
  }

  const projectPrefs = join(projectRoot, '.agents', 'preferences.yaml');
  const projectValue = await readBaseDirFromYaml(projectPrefs);
  if (projectValue !== undefined) {
    return resolveValue(projectValue, projectRoot, home);
  }

  const globalPrefs = join(home, '.agents', 'preferences.yaml');
  const globalValue = await readBaseDirFromYaml(globalPrefs);
  if (globalValue !== undefined) {
    return resolveValue(globalValue, projectRoot, home);
  }

  return join(home, '.ai');
}

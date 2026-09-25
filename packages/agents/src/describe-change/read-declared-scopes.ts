import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import type { ScopeDir } from './resolve-scopes.ts';

/**
 * Reads the scope directories that the repository declares under `project.scopes` in its own preferences file. The
 * global preferences file contributes none, since a directory's scope is a fact about one repository.
 *
 * An entry that cannot be honored is skipped with a warning naming its index and fault, so the valid entries beside it
 * still resolve. Throws when the file exists but its YAML is malformed, naming the file.
 */
export async function readDeclaredScopes(projectRoot: string): Promise<DeclaredScopes> {
  const file = path.join(projectRoot, '.agents', 'preferences.yaml');
  const empty: DeclaredScopes = { scopeDirs: [], warnings: [] };

  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return empty;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw chainError(`${file}: malformed YAML`, error);
  }
  if (!isRecord(parsed) || !isRecord(parsed.project) || !('scopes' in parsed.project)) {
    return empty;
  }

  const entries = parsed.project.scopes;
  if (!Array.isArray(entries)) {
    return { scopeDirs: [], warnings: [`${file}: project.scopes is not a list; ignoring it`] };
  }

  const scopeDirs: ScopeDir[] = [];
  const warnings: string[] = [];
  for (const [index, entry] of entries.entries()) {
    const result = await readEntry(entry, projectRoot);
    if (typeof result === 'string') {
      warnings.push(`${file}: project.scopes[${index}] ${result}; skipping it`);
    } else {
      scopeDirs.push(result);
    }
  }
  return { scopeDirs, warnings };
}

/** The scope directories that a repository declares, and a warning for each entry skipped. */
export interface DeclaredScopes {
  scopeDirs: ScopeDir[];
  warnings: string[];
}

// region | Helpers

/** Validates one `project.scopes` entry into a scope directory, or returns the fault that disqualifies it. */
async function readEntry(entry: unknown, projectRoot: string): Promise<ScopeDir | string> {
  if (!isRecord(entry)) {
    return 'is not a mapping';
  }
  const { name, path: declaredPath } = entry;
  if (typeof declaredPath !== 'string' || declaredPath === '') {
    return 'has no string `path`';
  }
  if ('name' in entry && (typeof name !== 'string' || name.trim() === '')) {
    return 'has a `name` that is not a non-empty string';
  }
  if (path.isAbsolute(declaredPath)) {
    return `has an absolute path ${declaredPath}`;
  }

  const dir = path.resolve(projectRoot, declaredPath);
  const relative = path.relative(projectRoot, dir);
  if (relative === '..' || relative.startsWith(`..${path.sep}`)) {
    return `has a path ${declaredPath} outside the repository`;
  }

  try {
    if (!(await stat(dir)).isDirectory()) {
      return `has a path ${declaredPath} that is not a directory`;
    }
  } catch (error) {
    if (isMissingFile(error)) {
      return `has a path ${declaredPath} that does not exist`;
    }
    throw error;
  }

  return { dir, name: typeof name === 'string' ? name : path.basename(dir) };
}

// endregion | Helpers

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { parse } from 'yaml';

import { isEnoent } from '../type-guards.js';
import type { KbConfig, KbConfigEntry } from '../types.js';
import { kbConfigFileSchema } from './kb-config-schema.js';

const USER_CONFIG_RELATIVE = join('.claude', 'kb.yaml');
const PROJECT_CONFIG_RELATIVE = join('.agents', 'kb.yaml');

/**
 * Load and merge the user-global (`~/.claude/kb.yaml`) and project-local
 * (`.agents/kb.yaml`) KB registries into a normalized `KbConfig`.
 *
 * Project entries replace user entries by name on collision and append new
 * names. Within a single file, relative `path` values resolve against that
 * file's directory and a leading `~/` expands against `$HOME`. Both files are
 * optional; when neither exists the result has no entries. Malformed YAML, a
 * structural defect, or two entries marked `default: true` in one file throw.
 */
export async function loadKbConfig(
  input: { userConfigPath?: string; projectDir?: string; home?: string } = {},
): Promise<KbConfig> {
  const home = input.home ?? homedir();
  const userConfigPath = input.userConfigPath ?? join(home, USER_CONFIG_RELATIVE);
  const projectConfigPath =
    input.projectDir === undefined ? undefined : join(input.projectDir, PROJECT_CONFIG_RELATIVE);

  const userEntries = await loadConfigFile(userConfigPath, 'user', home);
  const projectEntries =
    projectConfigPath === undefined ? undefined : await loadConfigFile(projectConfigPath, 'project', home);

  const merged = mergeEntries(userEntries?.entries ?? [], projectEntries?.entries ?? []);

  const sources: KbConfig['sources'] = {};
  if (userEntries !== undefined) sources.user = userConfigPath;
  if (projectConfigPath !== undefined && projectEntries !== undefined) {
    sources.project = projectConfigPath;
  }

  return { entries: merged, sources };
}

// region | Helpers

/**
 * Read and validate one registry file. Returns `undefined` when the file is
 * absent; throws on malformed YAML, a structural defect, or a duplicate
 * `default: true`.
 */
async function loadConfigFile(
  path: string,
  source: KbConfigEntry['source'],
  home: string,
): Promise<{ entries: KbConfigEntry[] } | undefined> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path}: malformed YAML — ${message}`);
  }
  if (parsed === null || parsed === undefined) {
    return { entries: [] };
  }

  const result = kbConfigFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${path}: invalid kb.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const configDir = dirname(path);
  const entries: KbConfigEntry[] = [];
  const defaults: string[] = [];

  for (const [name, fileEntry] of Object.entries(result.data.kbs ?? {})) {
    entries.push({
      name,
      path: resolvePath(fileEntry.path, configDir, home),
      source,
      ...(fileEntry.description !== undefined && { description: fileEntry.description }),
      ...(fileEntry.default !== undefined && { default: fileEntry.default }),
      ...(fileEntry.readonly !== undefined && { readonly: fileEntry.readonly }),
    });
    if (fileEntry.default === true) {
      defaults.push(name);
    }
  }

  if (defaults.length > 1) {
    throw new Error(`${path}: multiple KB entries marked default: true (${defaults.join(', ')})`);
  }

  return { entries };
}

/**
 * Merge user entries with project entries: project replaces by name and
 * appends new names. When the merged set still carries both a user-sourced and
 * a project-sourced default, the project default wins and the user default
 * flag is cleared.
 */
function mergeEntries(userEntries: KbConfigEntry[], projectEntries: KbConfigEntry[]): KbConfigEntry[] {
  const byName = new Map<string, KbConfigEntry>();
  for (const entry of userEntries) {
    byName.set(entry.name, entry);
  }
  for (const entry of projectEntries) {
    byName.set(entry.name, entry);
  }
  const merged = [...byName.values()];

  const hasProjectDefault = merged.some((entry) => entry.source === 'project' && entry.default === true);
  if (!hasProjectDefault) {
    return merged;
  }
  return merged.map((entry) =>
    entry.source === 'user' && entry.default === true ? { ...entry, default: false } : entry,
  );
}

/** Resolve a `path` value: expand a leading tilde, then resolve relative paths against the config dir. */
function resolvePath(value: string, configDir: string, home: string): string {
  const expanded = expandTilde(value, home);
  return isAbsolute(expanded) ? expanded : resolve(configDir, expanded);
}

/** Expand a leading `~` or `~/` against the home directory; throws when `HOME` is unset. */
function expandTilde(value: string, home: string): string {
  if (value !== '~' && !value.startsWith('~/')) {
    return value;
  }
  if (home === '') {
    throw new Error(`cannot expand "${value}": HOME is not set`);
  }
  return value === '~' ? home : join(home, value.slice(2));
}

// endregion | Helpers

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { chainError, describeError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse } from 'yaml';

import { isEnoent } from '../type-guards.ts';
import type { KbRegistry, KbRegistryEntry } from '../types.ts';
import { kbRegistryFileSchema } from './kb-registry-schema.ts';

const USER_CONFIG_RELATIVE = join('.agents', 'kb.yaml');
const PROJECT_CONFIG_RELATIVE = join('.agents', 'kb.yaml');

/**
 * Load and merge the user-global (`~/.agents/kb.yaml`) and project-local
 * (`.agents/kb.yaml`) KB registries into a normalized `KbRegistry`.
 *
 * Project entries replace user entries by name on collision and append new names. The top-level `default_kb`
 * pointer resolves by name against the merged entries (the project's value overriding the user's); the resolved
 * entry is exposed as `defaultKb`.
 * Within a single file, relative `path` values resolve against that file's directory and a leading `~/` expands
 * against `$HOME`. Both files are optional; when neither exists the result has no entries.
 * Malformed YAML, a structural defect, or a `default_kb` that names no registered KB throw.
 */
export async function loadKbRegistry(
  input: { userConfigPath?: string; projectDir?: string; home?: string } = {},
): Promise<KbRegistry> {
  const home = input.home ?? homedir();
  const userConfigPath = input.userConfigPath ?? join(home, USER_CONFIG_RELATIVE);
  const projectConfigPath =
    input.projectDir === undefined ? undefined : join(input.projectDir, PROJECT_CONFIG_RELATIVE);

  const userFile = await loadRegistryFile(userConfigPath, 'user', home);
  const projectFile =
    projectConfigPath === undefined ? undefined : await loadRegistryFile(projectConfigPath, 'project', home);

  const merged = mergeEntries(userFile?.entries ?? [], projectFile?.entries ?? []);

  // The project's `default_kb` wins over the user's; the winning name resolves against the merged entries.
  let defaultKbName: string | undefined;
  let defaultKbSource = userConfigPath;
  if (projectFile?.defaultKb !== undefined) {
    defaultKbName = projectFile.defaultKb;
    defaultKbSource = projectConfigPath ?? userConfigPath;
  } else if (userFile?.defaultKb !== undefined) {
    defaultKbName = userFile.defaultKb;
  }
  const defaultKb = resolveDefaultKb(merged, defaultKbName, defaultKbSource);

  const sources: KbRegistry['sources'] = {};
  if (userFile !== undefined) sources.user = userConfigPath;
  if (projectConfigPath !== undefined && projectFile !== undefined) {
    sources.project = projectConfigPath;
  }

  return { entries: merged, ...(defaultKb !== undefined && { defaultKb }), sources };
}

/** The outcome of a no-throw registry load: the resolved config plus a captured error message when loading failed. */
export interface KbRegistryLoadResult {
  /** The merged registry, or an empty config when loading threw. */
  config: KbRegistry;
  /** The thrown error's message, present only when `loadKbRegistry` failed. */
  error?: string;
}

/**
 * Load the merged `kb.yaml` registry without throwing, capturing any failure message instead of presenting it.
 *
 * On success — including the legitimate "no registry files present" case, which `loadKbRegistry` already returns as an
 * empty config — `error` is absent. On a malformed file, a schema violation, an unresolvable `default_kb`, or a
 * non-ENOENT read failure, the result degrades to an empty config and carries the thrown message in `error`. Each
 * caller decides whether and how to surface that message; this wrapper neither writes to stderr nor builds a
 * diagnostic.
 */
export async function tryLoadKbRegistry(
  input: { userConfigPath?: string; projectDir?: string; home?: string } = {},
): Promise<KbRegistryLoadResult> {
  try {
    return { config: await loadKbRegistry(input) };
  } catch (error) {
    return { config: { entries: [], sources: {} }, error: describeError(error) };
  }
}

// region | Helpers

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

/**
 * Read and validate one registry file, returning its entries and raw `default_kb` (if any). Returns `undefined`
 * when the file is absent; throws on malformed YAML or a structural defect.
 */
async function loadRegistryFile(
  path: string,
  source: KbRegistryEntry['source'],
  home: string,
): Promise<{ entries: KbRegistryEntry[]; defaultKb?: string } | undefined> {
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
    throw chainError(`${path}: malformed YAML`, error);
  }
  if (parsed === null || parsed === undefined) {
    return { entries: [] };
  }

  const result = kbRegistryFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${path}: invalid kb.yaml — ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const configDir = dirname(path);
  const entries: KbRegistryEntry[] = [];

  for (const [name, fileEntry] of Object.entries(result.data.kbs ?? {})) {
    entries.push({
      name,
      path: resolvePath(fileEntry.path, configDir, home),
      source,
      ...(fileEntry.description !== undefined && { description: fileEntry.description }),
      ...(fileEntry.readonly !== undefined && { readonly: fileEntry.readonly }),
    });
  }

  return { entries, ...(result.data.default_kb !== undefined && { defaultKb: result.data.default_kb }) };
}

/** Merge user entries with project entries: project replaces by name and appends new names. */
function mergeEntries(userEntries: KbRegistryEntry[], projectEntries: KbRegistryEntry[]): KbRegistryEntry[] {
  const byName = new Map<string, KbRegistryEntry>();
  for (const entry of userEntries) {
    byName.set(entry.name, entry);
  }
  for (const entry of projectEntries) {
    byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

/**
 * Resolve the effective `default_kb` name to its merged entry. Returns `undefined` when no `default_kb` is set;
 * throws naming the source file when the name matches no registered KB.
 */
function resolveDefaultKb(
  entries: KbRegistryEntry[],
  name: string | undefined,
  sourcePath: string,
): KbRegistryEntry | undefined {
  if (name === undefined) {
    return undefined;
  }
  const match = entries.find((entry) => entry.name === name);
  if (match === undefined) {
    throw new Error(`${sourcePath}: default_kb "${name}" does not match any registered KB`);
  }
  return match;
}

/** Resolve a `path` value: expand a leading tilde, then resolve relative paths against the config dir. */
function resolvePath(value: string, configDir: string, home: string): string {
  const expanded = expandTilde(value, home);
  return isAbsolute(expanded) ? expanded : resolve(configDir, expanded);
}

// endregion | Helpers

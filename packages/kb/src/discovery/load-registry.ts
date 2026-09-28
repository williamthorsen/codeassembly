import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse } from 'yaml';

import { isEnoent } from '../type-guards.ts';
import type { KbRegistry, KbRegistryEntry } from '../types.ts';
import { kbRegistryFileSchema } from './kb-registry-schema.ts';

const USER_CONFIG_RELATIVE = join('.agents', 'kb.yaml');
const PROJECT_CONFIG_RELATIVE = join('.agents', 'kb.yaml');

/** A top-level `kb.yaml` key that assigns a role to one registered KB. */
type RoleKey = 'default_kb' | 'feedback_kb';

/** One registry file's normalized entries and its raw role pointers. */
type RegistryFileContents = { entries: KbRegistryEntry[] } & Partial<Record<RoleKey, string>>;

/**
 * Loads and merges the user-global (`~/.agents/kb.yaml`) and project-local
 * (`.agents/kb.yaml`) KB registries into a normalized `KbRegistry`.
 *
 * Project entries replace user entries by name on collision and append new names. The top-level `default_kb` and
 * `feedback_kb` pointers each resolve by name against the merged entries (the project's value overriding the user's);
 * the resolved entries are exposed as `defaultKb` and `feedbackKb`.
 * Within a single file, relative `path` values resolve against that file's directory and a leading `~` or `~/`
 * expands against `$HOME`. Both files are optional; when neither exists the result does not contain any entries.
 * Malformed YAML, a structural defect, or a role pointer that does not match any registered KB throw.
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

  const files = { user: userFile, userPath: userConfigPath, project: projectFile, projectPath: projectConfigPath };
  const defaultKb = resolveRoleKb(merged, 'default_kb', files);
  const feedbackKb = resolveRoleKb(merged, 'feedback_kb', files);

  const sources: KbRegistry['sources'] = {};
  if (userFile !== undefined) sources.user = userConfigPath;
  if (projectConfigPath !== undefined && projectFile !== undefined) {
    sources.project = projectConfigPath;
  }

  return {
    entries: merged,
    ...(defaultKb !== undefined && { defaultKb }),
    ...(feedbackKb !== undefined && { feedbackKb }),
    sources,
  };
}

/** The outcome of a no-throw registry load: the resolved config plus a captured error message when loading failed. */
export interface KbRegistryLoadResult {
  /** The merged registry, or an empty config when loading threw. */
  config: KbRegistry;
  /** The thrown error's message, present only when `loadKbRegistry` failed. */
  error?: string;
}

/**
 * Loads the merged `kb.yaml` registry without throwing, capturing any failure message instead of presenting it.
 *
 * When `loadKbRegistry` throws, the result degrades to an empty config and contains the thrown message in `error`; the
 * caller decides whether and how to report that message. Absent registry files are a success, which `loadKbRegistry`
 * returns as an empty config.
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

/** Expands a leading `~` or `~/` against the home directory; throws when `HOME` is unset. */
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
 * Reads and validates one registry file, returning its entries and raw role pointers (if any). Returns `undefined`
 * when the file is absent; throws on malformed YAML or a structural defect.
 */
async function loadRegistryFile(
  path: string,
  source: KbRegistryEntry['source'],
  home: string,
): Promise<RegistryFileContents | undefined> {
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
    throw new Error(`${path}: invalid kb.yaml: ${result.error.issues[0]?.message ?? 'unknown error'}`);
  }

  const configDir = dirname(path);
  const entries: KbRegistryEntry[] = [];

  const fileEntries = Object.entries(result.data.kbs ?? {});
  for (const [name, fileEntry] of fileEntries) {
    entries.push({
      name,
      path: resolvePath(fileEntry.path, configDir, home),
      source,
      ...(fileEntry.description !== undefined && { description: fileEntry.description }),
      ...(fileEntry.readonly !== undefined && { readonly: fileEntry.readonly }),
    });
  }

  return {
    entries,
    ...(result.data.default_kb !== undefined && { default_kb: result.data.default_kb }),
    ...(result.data.feedback_kb !== undefined && { feedback_kb: result.data.feedback_kb }),
  };
}

/** Merges user entries with project entries: project replaces by name and appends new names. */
function mergeEntries(userEntries: KbRegistryEntry[], projectEntries: KbRegistryEntry[]): KbRegistryEntry[] {
  const byName = new Map<string, KbRegistryEntry>();
  for (const entry of userEntries) {
    byName.set(entry.name, entry);
  }
  for (const entry of projectEntries) {
    byName.set(entry.name, entry);
  }
  return byName.values().toArray();
}

/**
 * Resolves a role pointer to its merged entry, the project file's value overriding the user file's. Returns
 * `undefined` when neither file sets the key; throws naming the source file when the name does not match any
 * registered KB.
 */
function resolveRoleKb(
  entries: KbRegistryEntry[],
  key: RoleKey,
  files: {
    user: RegistryFileContents | undefined;
    userPath: string;
    project: RegistryFileContents | undefined;
    projectPath: string | undefined;
  },
): KbRegistryEntry | undefined {
  const projectName = files.project?.[key];
  const name = projectName ?? files.user?.[key];
  if (name === undefined) {
    return undefined;
  }
  const sourcePath = projectName === undefined ? files.userPath : (files.projectPath ?? files.userPath);
  const match = entries.find((entry) => entry.name === name);
  if (match === undefined) {
    throw new Error(`${sourcePath}: ${key} "${name}" does not match any registered KB`);
  }
  return match;
}

/** Resolves a `path` value: expands a leading tilde, then resolves a relative path against the config dir. */
function resolvePath(value: string, configDir: string, home: string): string {
  const expanded = expandTilde(value, home);
  return isAbsolute(expanded) ? expanded : resolve(configDir, expanded);
}

// endregion | Helpers

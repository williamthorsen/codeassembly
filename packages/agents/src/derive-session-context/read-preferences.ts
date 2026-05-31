/**
 * Read `.agents/preferences.yaml` (project-local) and `~/.agents/preferences.yaml` (global), merge
 * with project-overrides-global precedence, project to the typed shape the deriver consumes, and
 * return that alongside the source paths actually read.
 *
 * Unknown sibling keys at any depth are tolerated. Schema validation is an authoring-time concern,
 * not a read-time one.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { isEnoent } from '@codeassembly/kb-core';
import { parse as parseYaml } from 'yaml';

import type { PreferencesReadResult, ResolvedPreferences } from './types.ts';

/**
 * Reads project and global preferences files (both optional), merges them with project values
 * winning over global, projects to the typed `ResolvedPreferences` shape by reading only the
 * fields the deriver consumes, and returns the result.
 *
 * - Missing files (project or global) are not errors — treated as empty and the other source is used.
 * - Malformed YAML throws with a message that names the offending file.
 * - Wrong type or out-of-enum value on a consumed field throws with a key-path-anchored message.
 * - Unknown sibling keys at any depth pass through silently.
 */
export async function readPreferences(input: { cwd: string; home?: string }): Promise<PreferencesReadResult> {
  const home = input.home ?? homedir();
  const projectPath = path.join(input.cwd, '.agents', 'preferences.yaml');
  const globalPath = path.join(home, '.agents', 'preferences.yaml');

  const project = await readOptionalYaml(projectPath);
  const global = await readOptionalYaml(globalPath);

  const merged = mergeTopLevel(global?.value, project?.value);
  const preferences = projectPreferences(merged);

  const sources: PreferencesReadResult['sources'] = {
    ...(project !== null && { project: projectPath }),
    ...(global !== null && { global: globalPath }),
  };

  return {
    preferences,
    sources,
  };
}

// region | Helpers

/**
 * Read a YAML file. Returns `null` when the file does not exist (ENOENT). Throws with a
 * file-anchored message when the YAML is malformed.
 */
async function readOptionalYaml(filePath: string): Promise<{ value: unknown } | null> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: malformed YAML — ${message}`);
  }
  // An empty document parses to `null`; treat it as "file present but empty".
  return { value: parsed ?? {} };
}

/**
 * Top-level merge of two preference objects: For each top-level key present in `project`, the
 * project value replaces the global value verbatim. Top-level keys only in `global` are retained.
 *
 * The merge is deliberately shallow (top-level only). Project-level values always win at the
 * section level. Shallow merge avoids surprising deep-merge behavior for fields like
 * `artifacts.paths`, where a project that sets one path key would otherwise inherit the others
 * from the global file.
 */
function mergeTopLevel(global: unknown, project: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (isRecord(global)) {
    for (const [key, value] of Object.entries(global)) {
      result[key] = value;
    }
  }
  if (isRecord(project)) {
    for (const [key, value] of Object.entries(project)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Walks `merged` and returns a typed `ResolvedPreferences` populated from the fields the deriver
 * consumes. Unknown sibling keys at any depth are ignored. Throws when a consumed field has the
 * wrong type or an out-of-enum value, with a key-path-anchored message.
 */
function projectPreferences(merged: Record<string, unknown>): ResolvedPreferences {
  const result: WritablePreferences = {};

  if (merged.platform !== undefined) {
    result.platform = expectPlatform(merged.platform);
  }

  if (merged.project !== undefined) {
    const section = expectRecord(merged.project, 'project');
    const project: WritablePreferences['project'] = {};
    if (section.slug !== undefined) {
      project.slug = expectString(section.slug, 'project.slug');
    }
    if (section.ticket_ref_prefix !== undefined) {
      project.ticket_ref_prefix = expectString(section.ticket_ref_prefix, 'project.ticket_ref_prefix');
    }
    result.project = project;
  }

  if (merged.repository !== undefined) {
    const section = expectRecord(merged.repository, 'repository');
    const repository: WritablePreferences['repository'] = {};
    if (section.slug !== undefined) {
      repository.slug = expectString(section.slug, 'repository.slug');
    }
    if (section.default_remote !== undefined) {
      const remoteSection = expectRecord(section.default_remote, 'repository.default_remote');
      const defaultRemote: NonNullable<WritablePreferences['repository']>['default_remote'] = {};
      if (remoteSection.name !== undefined) {
        defaultRemote.name = expectString(remoteSection.name, 'repository.default_remote.name');
      }
      if (remoteSection.default_branch !== undefined) {
        defaultRemote.default_branch = expectString(
          remoteSection.default_branch,
          'repository.default_remote.default_branch',
        );
      }
      repository.default_remote = defaultRemote;
    }
    result.repository = repository;
  }

  if (merged.artifacts !== undefined) {
    const section = expectRecord(merged.artifacts, 'artifacts');
    const artifacts: WritablePreferences['artifacts'] = {};
    if (section.base_dir !== undefined) {
      artifacts.base_dir = expectString(section.base_dir, 'artifacts.base_dir');
    }
    if (section.paths !== undefined) {
      const pathsSection = expectRecord(section.paths, 'artifacts.paths');
      const paths: Record<string, string> = {};
      for (const [key, value] of Object.entries(pathsSection)) {
        paths[key] = expectString(value, `artifacts.paths.${key}`);
      }
      artifacts.paths = paths;
    }
    result.artifacts = artifacts;
  }

  return result;
}

/** Mutable mirror of `ResolvedPreferences` used during projection construction. */
interface WritablePreferences {
  platform?: 'github' | 'bitbucket';
  project?: {
    slug?: string;
    ticket_ref_prefix?: string;
  };
  repository?: {
    slug?: string;
    default_remote?: {
      name?: string;
      default_branch?: string;
    };
  };
  artifacts?: {
    base_dir?: string;
    paths?: Record<string, string>;
  };
}

/**
 * Narrows `value` to the `platform` enum. Throws with the offending key path when the value is
 * neither `"github"` nor `"bitbucket"`.
 */
function expectPlatform(value: unknown): 'github' | 'bitbucket' {
  if (value === 'github' || value === 'bitbucket') {
    return value;
  }
  throw new Error(`preferences: 'platform' must be "github" or "bitbucket" (got ${formatValue(value)})`);
}

/** Narrows `value` to `string`. Throws with the offending key path when the value is not a string. */
function expectString(value: unknown, keyPath: string): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`preferences: '${keyPath}' must be a string (got ${formatValue(value)})`);
}

/** Narrows `value` to a plain object. Throws with the offending key path when the value is not one. */
function expectRecord(value: unknown, keyPath: string): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }
  throw new Error(`preferences: '${keyPath}' must be an object (got ${formatValue(value)})`);
}

/**
 * Renders an unknown value for an error message. Strings are quoted; everything else goes through
 * `JSON.stringify` so arrays, numbers, booleans, and `null` render distinguishably. Symbols and
 * other non-serializable values fall back to `String(value)`.
 */
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Narrows `value` to a plain object with unknown property values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// endregion | Helpers

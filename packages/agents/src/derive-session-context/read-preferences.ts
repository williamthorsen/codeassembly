/**
 * Reads the project and global `preferences.yaml` files. Schema validation is an authoring-time concern, not a
 * read-time one, so unknown keys pass through at any depth.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';

import { isEnoent, isRecord } from '../lib/type-guards.ts';
import type { PreferencesReadResult, ResolvedPreferences } from './types.ts';

/**
 * Reads the project and global preferences files, merges them with the project's values winning, and projects the
 * result to the fields that the deriver consumes. A missing file is not an error; malformed YAML and a wrong-typed
 * consumed field throw, naming the offending file or key path.
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
    throw chainError(`${filePath}: malformed YAML`, error);
  }
  // An empty document parses to `null`; treat it as "file present but empty".
  return { value: parsed ?? {} };
}

/**
 * Merges two preference objects at the top level: a key present in `project` replaces the global value verbatim, and a
 * key only in `global` is retained. The merge stays shallow so that a project setting one `artifacts.paths` key does
 * not inherit the rest from the global file.
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

/** Walks `merged` and returns a typed `ResolvedPreferences` populated from the fields that the deriver consumes. */
function projectPreferences(merged: Record<string, unknown>): ResolvedPreferences {
  const result: WritablePreferences = {};

  // Fall back to the legacy top-level `platform` key, so that an existing `bitbucket` configuration still resolves.
  const scmValue = merged.scm ?? merged.platform;
  if (scmValue !== undefined) {
    if (merged.scm === undefined) {
      process.stderr.write("preferences: the top-level 'platform' key is deprecated; rename it to 'scm'.\n");
    }
    result.scm = expectScm(scmValue);
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

  if (merged.ticket !== undefined) {
    const section = expectRecord(merged.ticket, 'ticket');
    const ticket: WritablePreferences['ticket'] = {};
    if (section.base_url !== undefined) {
      ticket.base_url = expectString(section.base_url, 'ticket.base_url');
    }
    result.ticket = ticket;
  }

  return result;
}

/** Mutable mirror of `ResolvedPreferences` used during projection construction. */
interface WritablePreferences {
  scm?: 'github' | 'bitbucket';
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
  ticket?: {
    base_url?: string;
  };
}

/**
 * Narrows `value` to the `scm` enum. Throws with the offending key path when the value is
 * neither `"github"` nor `"bitbucket"`.
 */
function expectScm(value: unknown): 'github' | 'bitbucket' {
  if (value === 'github' || value === 'bitbucket') {
    return value;
  }
  throw new Error(`preferences: 'scm' must be "github" or "bitbucket" (got ${formatValue(value)})`);
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
 * Renders an unknown value for an error message through `JSON.stringify`, falling back to `String` for a value that it
 * cannot serialize.
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

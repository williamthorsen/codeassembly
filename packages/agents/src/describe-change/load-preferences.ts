import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';
import { parse as parseYaml } from 'yaml';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import { type Surface, SURFACES } from './types.ts';

/**
 * Resolves each surface's title template from the project preferences file, then the global one, then the empty
 * string. Resolution is per key rather than per section, so a project file that names `commit.title_format` alone
 * still inherits the other three from the global file.
 *
 * A key the project file names wins even where its value is empty, which is how a repository opts one surface out of a
 * template the global file configures.
 *
 * Throws where a preferences file exists but its YAML is malformed, naming the file. A silent fall-through would
 * render bare titles from a file the author believes is in force.
 */
export async function loadPreferences(input: { home: string; projectRoot: string }): Promise<LoadedPreferences> {
  const warnings: string[] = [];
  const project = await readTitleFormats(path.join(input.projectRoot, '.agents', 'preferences.yaml'), warnings);
  const global = await readTitleFormats(path.join(input.home, '.agents', 'preferences.yaml'), warnings);

  const templates = {
    commit: project.commit ?? global.commit ?? '',
    ticket: project.ticket ?? global.ticket ?? '',
    pr: project.pr ?? global.pr ?? '',
    merge: project.merge ?? global.merge ?? '',
  };
  return { templates, warnings };
}

/**
 * Resolves the directory the `.agents/` lookup is anchored at: the repository root, so the templates a run reads do
 * not depend on which subdirectory the caller invoked it from. Falls back to `cwd` outside a repository, reporting
 * git's own diagnostic so a misanchored run is debuggable rather than silent.
 */
export async function resolveProjectRoot(cwd: string): Promise<{ projectRoot: string; warning?: string }> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
    return { projectRoot: stdout.trim() };
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message.trim().split('\n').at(-1) : String(error);
    return {
      projectRoot: cwd,
      warning: `git could not resolve the repository root (${diagnostic}); anchoring the .agents/ lookup at ${cwd}`,
    };
  }
}

/** The four resolved templates, and whatever the resolution had to report about how it got there. */
export interface LoadedPreferences {
  templates: Record<Surface, string>;
  warnings: string[];
}

// region | Helpers

const execFileAsync = promisify(execFile);

/**
 * Reads one preferences file into the `title_format` value each surface declares, absent where the file omits the key.
 * A missing file contributes nothing; a key present with no value reads as the empty string, which is the explicit way
 * to opt a surface out.
 */
async function readTitleFormats(file: string, warnings: string[]): Promise<Partial<Record<Surface, string>>> {
  let content: string;
  try {
    content = await readFile(file, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return {};
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error) {
    throw chainError(`${file}: malformed YAML`, error);
  }
  if (!isRecord(parsed)) {
    return {};
  }

  const formats: Partial<Record<Surface, string>> = {};
  for (const surface of SURFACES) {
    const section = parsed[surface];
    if (!isRecord(section) || !('title_format' in section)) {
      continue;
    }
    const value = section.title_format;
    if (value === null || value === undefined) {
      formats[surface] = '';
    } else if (typeof value === 'string') {
      formats[surface] = value;
    } else {
      warnings.push(`${file}: ${surface}.title_format is not a string; ignoring it`);
    }
  }
  return formats;
}

// endregion | Helpers

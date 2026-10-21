import { stat } from 'node:fs/promises';
import path from 'node:path';

import { chainError } from '@williamthorsen/toolbelt.errors/candidate';

import { resolveProjectRoot } from './load-preferences.ts';
import type { RunInput } from './types.ts';

/**
 * Resolves the directory that `--project-root` names against the invoking directory and adds it to the run's input,
 * refusing a path that is not a directory.
 */
export async function applyProjectRoot(input: RunInput, projectRoot: string | undefined): Promise<RunInput> {
  if (projectRoot === undefined) {
    return input;
  }
  const resolved = path.resolve(input.cwd, projectRoot);
  let isDirectory: boolean;
  try {
    isDirectory = (await stat(resolved)).isDirectory();
  } catch (error) {
    throw chainError(`--project-root ${resolved} cannot be read`, error);
  }
  if (!isDirectory) {
    throw new Error(`--project-root ${resolved} is not a directory`);
  }
  return { ...input, projectRoot: resolved };
}

/**
 * Resolves the run's project root: the directory that `--project-root` names when the invocation passes one, and the
 * repository root of the invoking directory otherwise.
 */
export function resolveRunProjectRoot(input: RunInput): { projectRoot: string; warning?: string } {
  return input.projectRoot === undefined
    ? resolveProjectRoot(input.cwd, input.git)
    : { projectRoot: input.projectRoot };
}

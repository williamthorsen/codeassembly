import { homedir } from 'node:os';
import { join } from 'node:path';

import { resolveBaseDir, type ResolveBaseDirOptions } from './resolve-base-dir.js';

/**
 * Expand a leading `~/` prefix to the home directory.
 */
function expandTilde(value: string, home: string): string {
  if (value === '~') return home;
  if (value.startsWith('~/')) return join(home, value.slice(2));
  return value;
}

/**
 * Resolve the projects directory using a preference cascade:
 *
 * 1. `AI_PROJECTS_PATH` env var (used directly — already points to projects dir)
 * 2. `artifacts.base_dir` from `{projectRoot}/.agents/preferences.yaml` + `/projects`
 * 3. `artifacts.base_dir` from `~/.agents/preferences.yaml` + `/projects`
 * 4. Default: `~/.ai/projects`
 */
export async function resolveProjectsDir(projectRoot: string, options?: ResolveBaseDirOptions): Promise<string> {
  const home = options?.home ?? homedir();

  // 1. AI_PROJECTS_PATH env var (points directly to projects dir)
  const envPath = process.env.AI_PROJECTS_PATH;
  if (envPath) {
    return expandTilde(envPath, home);
  }

  // 2-3. Preferences cascade, then default (~/.ai)
  const base = await resolveBaseDir(projectRoot, undefined, options);

  // 4. Append /projects
  return join(base, 'projects');
}

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { HarnessConfig, HarnessId, InstallOptions } from './types.js';

/** Harness configuration table. */
export const HARNESSES: Record<HarnessId, HarnessConfig> = {
  claude: {
    id: 'claude',
    homeDir: '.claude',
    skillsDirName: 'skills',
    subagentsDirName: 'agents',
    scriptsDirName: 'scripts',
    frontmatterFile: 'claude.yaml',
    skillSigil: '/',
    subagentSigil: '',
  },
  rovodev: {
    id: 'rovodev',
    homeDir: '.rovodev',
    skillsDirName: 'skills',
    subagentsDirName: 'subagents',
    scriptsDirName: 'scripts',
    frontmatterFile: 'rovodev.yaml',
    skillSigil: '!',
    subagentSigil: '',
  },
};

const ALL_HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude', 'rovodev'];

/**
 * Detects which harnesses have their home directories present.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function detectHarnesses(baseDir?: string): ReadonlyArray<HarnessId> {
  const home = baseDir ?? homedir();
  return ALL_HARNESS_IDS.filter((id) => {
    const config = HARNESSES[id];
    return existsSync(path.join(home, config.homeDir));
  });
}

/**
 * Resolves absolute paths for a harness's skill and subagent directories.
 * @param harnessId The harness to resolve paths for.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function resolveHarnessPaths(
  harnessId: HarnessId,
  baseDir?: string,
): {
  harnessHome: string;
  skillsDir: string;
  subagentsDir: string;
  scriptsDir: string;
} {
  const home = baseDir ?? homedir();
  const config = HARNESSES[harnessId];
  const harnessHome = path.join(home, config.homeDir);
  return {
    harnessHome,
    skillsDir: path.join(harnessHome, config.skillsDirName),
    subagentsDir: path.join(harnessHome, config.subagentsDirName),
    scriptsDir: path.join(harnessHome, config.scriptsDirName),
  };
}

/**
 * Resolves which harness IDs to target based on the option value.
 * @param harness A specific harness ID or 'all' to detect available harnesses.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function resolveHarnessIds(harness: InstallOptions['harness'], baseDir?: string): ReadonlyArray<HarnessId> {
  if (harness === 'all') {
    return detectHarnesses(baseDir);
  }
  return [harness];
}

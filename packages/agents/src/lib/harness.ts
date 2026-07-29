import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { AmbientHostKind, HarnessConfig, HarnessId, InstallOptions } from './types.js';

/** Harness configuration table. */
export const HARNESSES: Record<HarnessId, HarnessConfig> = {
  claude: {
    id: 'claude',
    homeDir: '.claude',
    skillsDirName: 'skills',
    subagentsDirName: 'agents',
    scriptsDirName: 'scripts',
    configFileName: 'settings.json',
    frontmatterFile: 'claude.yaml',
    guidanceFileName: 'CLAUDE.md',
    localGuidanceFileName: 'CLAUDE.local.md',
    skillSigil: '/',
    subagentSigil: '',
  },
  rovodev: {
    id: 'rovodev',
    homeDir: '.rovodev',
    skillsDirName: 'skills',
    subagentsDirName: 'subagents',
    scriptsDirName: 'scripts',
    configFileName: 'config.yml',
    frontmatterFile: 'rovodev.yaml',
    guidanceFileName: 'AGENTS.md',
    localGuidanceFileName: 'AGENTS.local.md',
    skillSigil: '!',
    subagentSigil: '',
  },
};

/** Every known harness identifier. */
export const ALL_HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude', 'rovodev'];

/** Membership set for `isHarnessId`, widened to `string` so an arbitrary value tests without a type assertion. */
const HARNESS_ID_SET: ReadonlySet<string> = new Set(ALL_HARNESS_IDS);

/** Narrows an arbitrary string to a known harness identifier. */
export function isHarnessId(value: string): value is HarnessId {
  return HARNESS_ID_SET.has(value);
}

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
 * Resolves the guidance file that hosts a harness's ambient region under `baseDir`, which is the domain's base: the
 * home directory for the home domain, the project root for the project domain. The home domain's host sits under the
 * harness home; the project domain's sits at the project root, because that is where each harness loads its
 * machine-local project guidance from. `baseDir` is required — unlike the harness-home paths, a project-local host
 * has no meaningful default.
 */
export function resolveAmbientHostPath(harnessId: HarnessId, hostKind: AmbientHostKind, baseDir: string): string {
  const config = HARNESSES[harnessId];
  return hostKind === 'harness-home'
    ? path.join(baseDir, config.homeDir, config.guidanceFileName)
    : path.join(baseDir, config.localGuidanceFileName);
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
  configFile: string;
  guidanceFile: string;
} {
  const home = baseDir ?? homedir();
  const config = HARNESSES[harnessId];
  const harnessHome = path.join(home, config.homeDir);
  return {
    harnessHome,
    skillsDir: path.join(harnessHome, config.skillsDirName),
    subagentsDir: path.join(harnessHome, config.subagentsDirName),
    scriptsDir: path.join(harnessHome, config.scriptsDirName),
    configFile: path.join(harnessHome, config.configFileName),
    guidanceFile: path.join(harnessHome, config.guidanceFileName),
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

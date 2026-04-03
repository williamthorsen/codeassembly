import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { InstallOptions, PlatformConfig, PlatformId } from './types.js';

/** Platform configuration table. */
export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  claude: {
    id: 'claude',
    homeDir: '.claude',
    skillsDir: 'skills',
    subagentsDir: 'agents',
    scriptsDir: 'scripts',
    frontmatterFile: 'claude.yml',
  },
  rovodev: {
    id: 'rovodev',
    homeDir: '.rovodev',
    skillsDir: 'skills',
    subagentsDir: 'subagents',
    scriptsDir: 'scripts',
    frontmatterFile: 'rovodev.yml',
  },
};

const ALL_PLATFORM_IDS: ReadonlyArray<PlatformId> = ['claude', 'rovodev'];

/**
 * Detects which platforms have their home directories present.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function detectPlatforms(baseDir?: string): ReadonlyArray<PlatformId> {
  const home = baseDir ?? homedir();
  return ALL_PLATFORM_IDS.filter((id) => {
    const config = PLATFORMS[id];
    return existsSync(path.join(home, config.homeDir));
  });
}

/**
 * Resolves absolute paths for a platform's skill and subagent directories.
 * @param platformId The platform to resolve paths for.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function resolvePlatformPaths(
  platformId: PlatformId,
  baseDir?: string,
): {
  platformHome: string;
  skillsDir: string;
  subagentsDir: string;
  scriptsDir: string;
} {
  const home = baseDir ?? homedir();
  const config = PLATFORMS[platformId];
  const platformHome = path.join(home, config.homeDir);
  return {
    platformHome,
    skillsDir: path.join(platformHome, config.skillsDir),
    subagentsDir: path.join(platformHome, config.subagentsDir),
    scriptsDir: path.join(platformHome, config.scriptsDir),
  };
}

/**
 * Resolves which platform IDs to target based on the option value.
 * @param platform A specific platform ID or 'all' to detect available platforms.
 * @param baseDir Override for the home directory (defaults to `os.homedir()`).
 */
export function resolvePlatformIds(platform: InstallOptions['platform'], baseDir?: string): ReadonlyArray<PlatformId> {
  if (platform === 'all') {
    return detectPlatforms(baseDir);
  }
  return [platform];
}

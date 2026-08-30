import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { AmbientHostKind, HarnessConfig, HarnessId, InstallOptions } from './types.ts';

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
    // Claude names the canonical tools, so this maps each to itself.
    toolNames: {
      AskUserQuestion: 'AskUserQuestion',
      Bash: 'Bash',
      Edit: 'Edit',
      Glob: 'Glob',
      Grep: 'Grep',
      Read: 'Read',
      Task: 'Task',
      Write: 'Write',
    },
    guidanceFileName: 'CLAUDE.md',
    localGuidanceFileName: 'CLAUDE.local.md',
    skillSigil: '/',
    subagentSigil: '',
  },
  rovo: {
    id: 'rovo',
    // Atlassian's path, which renames on its own schedule; the id above is CodeAssembly's own vocabulary.
    homeDir: '.rovo',
    skillsDirName: 'skills',
    subagentsDirName: 'subagents',
    scriptsDirName: 'scripts',
    configFileName: 'config.yml',
    frontmatterFile: 'rovo.yaml',
    // `Glob` has no exact Rovo Dev counterpart; `expand_folder` is the closest directory-exploration analogue,
    // accepted as the mapping for prose contexts.
    toolNames: {
      AskUserQuestion: 'ask_user_questions',
      Bash: 'bash',
      Edit: 'find_and_replace_code',
      Glob: 'expand_folder',
      Grep: 'grep',
      Read: 'open_files',
      Task: 'invoke_subagent',
      Write: 'create_file',
    },
    guidanceFileName: 'AGENTS.md',
    localGuidanceFileName: 'AGENTS.local.md',
    skillSigil: '!',
    subagentSigil: '',
  },
};

/** Every known harness identifier. */
export const ALL_HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude', 'rovo'];

/** Membership set for `isHarnessId`, widened to `string` so an arbitrary value tests without a type assertion. */
const HARNESS_ID_SET: ReadonlySet<string> = new Set(ALL_HARNESS_IDS);

/** Narrows an arbitrary string to a known harness identifier. */
export function isHarnessId(value: string): value is HarnessId {
  return HARNESS_ID_SET.has(value);
}

/**
 * Detects which harnesses are installed for this user, by the presence of their home directories. The argument is a
 * home directory and nothing else: a harness home is created by that harness's own installer, so passing any other
 * base asks a question this cannot answer.
 */
export function detectHarnesses(homeDir: string = homedir()): ReadonlyArray<HarnessId> {
  return ALL_HARNESS_IDS.filter((id) => {
    const config = HARNESSES[id];
    return existsSync(path.join(homeDir, config.homeDir));
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
 * The harness-relative prefix a deployed skill's `~/`-prefixed link targets are built under (e.g. `.claude/skills`).
 *
 * Shared by every pass that renders a skill — install, sync, and validate. The value is a formula rather than a field,
 * so a private copy of it would not fail to compile when the formula changed; it would just start emitting link targets
 * that resolve nowhere, on whichever pass was not updated.
 */
export function resolveSkillsPathPrefix(config: HarnessConfig): string {
  return `${config.homeDir}/${config.skillsDirName}`;
}

/**
 * Resolves which harnesses to target from the `--harness` value alone, falling back to what is installed under
 * `homeDir` when the value is the `'all'` sentinel.
 *
 * This serves `uninstall`, `status`, and `configure-hooks`, which must reach what is installed rather than what is
 * declared. `install` and `sync` resolve their targets through `resolveTargetHarnesses`, which consults the
 * `harnesses` declaration first.
 */
export function resolveHarnessIds(harness: InstallOptions['harness'], homeDir?: string): ReadonlyArray<HarnessId> {
  if (harness === 'all') {
    return detectHarnesses(homeDir);
  }
  return [harness];
}

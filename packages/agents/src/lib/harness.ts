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
    // Atlassian's path, which Atlassian renames on its own schedule; the id above is CodeAssembly's own vocabulary.
    homeDir: '.rovo',
    skillsDirName: 'skills',
    subagentsDirName: 'subagents',
    scriptsDirName: 'scripts',
    configFileName: 'config.yml',
    frontmatterFile: 'rovo.yaml',
    // Rovo Dev does not have an exact counterpart to `Glob`; `expand_folder` is the closest directory-exploration
    // analogue, accepted as the mapping for prose contexts.
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

/**
 * The frontmatter key by which a skill or a rulebook narrows itself to specific harnesses. Qualified rather than a bare
 * `harnesses`, which a declaration file uses for the unrelated job of choosing which harnesses a sync run targets.
 */
export const SUPPORTED_HARNESSES_KEY = 'supported-harnesses';

/** Every known harness identifier. */
export const ALL_HARNESS_IDS: ReadonlyArray<HarnessId> = ['claude', 'rovo'];

/** Membership set for `isHarnessId`, widened to `string` so that an arbitrary value tests without a type assertion. */
const HARNESS_ID_SET: ReadonlySet<string> = new Set(ALL_HARNESS_IDS);

/** Narrows an arbitrary string to a known harness identifier. */
export function isHarnessId(value: string): value is HarnessId {
  return HARNESS_ID_SET.has(value);
}

/**
 * True when an artifact targets `harnessId`: Either it doesn't name any harness (so all of them) or it lists this one.
 */
export function artifactTargetsHarness(
  artifact: { readonly targetHarnesses?: ReadonlyArray<HarnessId> },
  harnessId: HarnessId,
): boolean {
  return artifact.targetHarnesses === undefined || artifact.targetHarnesses.includes(harnessId);
}

/**
 * Detects which harnesses are installed for this user, by the presence of their home directories. The argument is a
 * home directory and nothing else: A harness home is created by that harness's own installer, so passing any other
 * base asks a question that this cannot answer.
 */
export function detectHarnesses(homeDir: string = homedir()): ReadonlyArray<HarnessId> {
  return ALL_HARNESS_IDS.filter((id) => {
    const config = HARNESSES[id];
    return existsSync(path.join(homeDir, config.homeDir));
  });
}

/**
 * Resolves the guidance file that hosts a harness's ambient region under `baseDir`, which is the domain's base: the
 * home directory for the home domain, the project root for the project domain. The home domain's host is under the
 * harness home; the project domain's is at the project root, because that is where each harness loads its
 * machine-local project guidance from. `baseDir` is required: Unlike the harness-home paths, a project-local host
 * does not have a meaningful default.
 */
export function resolveAmbientHostPath(harnessId: HarnessId, hostKind: AmbientHostKind, baseDir: string): string {
  const config = HARNESSES[harnessId];
  return hostKind === 'harness-home'
    ? path.join(baseDir, config.homeDir, config.guidanceFileName)
    : path.join(baseDir, config.localGuidanceFileName);
}

/** Resolves absolute paths for a harness's skill and subagent directories, under `baseDir` or the home directory. */
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
 * The harness-relative prefix under which a deployed skill's `~/`-prefixed link targets are built (e.g.
 * `.claude/skills`).
 */
export function resolveSkillsPathPrefix(config: HarnessConfig): string {
  return `${config.homeDir}/${config.skillsDirName}`;
}

/**
 * Resolves which harnesses to target from the `--harness` value alone, falling back to what is installed under
 * `homeDir` when the value is the `'all'` sentinel. Targets what is installed rather than what is declared;
 * `resolveTargetHarnesses` consults the `harnesses` declaration first.
 */
export function resolveHarnessIds(harness: InstallOptions['harness'], homeDir?: string): ReadonlyArray<HarnessId> {
  if (harness === 'all') {
    return detectHarnesses(homeDir);
  }
  return [harness];
}

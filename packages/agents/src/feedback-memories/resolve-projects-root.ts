import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Resolves the machine's Claude project-stores root (`<config-dir>/projects`). The config dir is `CLAUDE_CONFIG_DIR`
 * when set — matching how Claude Code relocates its state — otherwise `<home>/.claude`. An injected `home` overrides the
 * ambient home directory, which is the single seam tests and the smoke test use to point the walk at a fixture instead
 * of the developer's real `~/.claude`.
 */
export function resolveProjectsRoot(input: { home?: string; env?: NodeJS.ProcessEnv }): string {
  const configDir = input.env?.CLAUDE_CONFIG_DIR;
  // Treat an empty CLAUDE_CONFIG_DIR as unset — an exported-but-empty shell variable should not resolve to a bogus
  // relative `projects` path, and this lets a caller neutralize an ambient value by passing an empty string.
  const base = configDir !== undefined && configDir !== '' ? configDir : join(input.home ?? homedir(), '.claude');
  return join(base, 'projects');
}

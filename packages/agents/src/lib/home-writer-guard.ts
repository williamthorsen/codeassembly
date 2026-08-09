import { readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { parseCodeAssemblyFile } from './codeassembly-schema.ts';
import { resolveScopeChain } from './scope-chain.ts';
import type { HomeWriteCommand } from './types.ts';

/** The inputs deciding whether this installation may write the home domain. */
export interface DesignatedWriterOptions {
  readonly command: HomeWriteCommand;
  /** Root of the package the running binary belongs to, compared against the designated path. */
  readonly packageRoot: string;
  /** Home directory whose `.agents/` tier carries the setting; defaults to the user's own. */
  readonly homeDir?: string | undefined;
  /** Whether `--override-writer` was passed, which proceeds from a non-designated installation and says so. */
  readonly shouldOverrideWriter?: boolean | undefined;
}

/** The designated writer as one file in the home chain declares it, paired with the file that declared it. */
interface DesignatedWriter {
  readonly configPath: string;
  readonly writerPath: string;
}

/**
 * Refuses a home-domain write from an installation the `home-writer` setting does not designate, before the command
 * writes anything or previews what it would write. The setting names one installation per machine; every repository
 * and worktree carries a binary that could otherwise overwrite the shared home state with its own library's contents.
 *
 * Passes when no home tier sets `home-writer`, so a machine that never configures one behaves as it always has, and
 * when the running package root lies at or under the designated path, so the setting may name either the worktree
 * root or the package directory within it. A malformed setting fails the run rather than lapsing into dormancy.
 */
export async function assertDesignatedWriter(options: DesignatedWriterOptions): Promise<void> {
  const homeDir = options.homeDir ?? homedir();
  const designated = await readDesignatedWriter(homeDir);
  if (designated === undefined) {
    return;
  }

  if (options.shouldOverrideWriter === true) {
    console.warn(
      `⚠️ Writing the home domain from ${options.packageRoot}, which --override-writer allows despite ` +
        `\`home-writer\` designating ${designated.writerPath}.`,
    );
    return;
  }

  if (await matchesDesignatedWriter(options.packageRoot, designated.writerPath)) {
    return;
  }

  throw new Error(
    `Refusing to run \`${options.command}\` from an installation that is not the designated home-domain writer.\n` +
      `  Designated:   ${designated.writerPath}\n` +
      `  Invoked from: ${options.packageRoot}\n` +
      `  Configured in: ${designated.configPath}\n` +
      `Run \`${options.command}\` from the designated installation, point \`home-writer\` at this one, or pass ` +
      '--override-writer to write from here anyway.',
  );
}

// region | Helpers

/** Expands a leading `~` against `homeDir`, leaving every other path untouched. */
function expandHome(rawPath: string, homeDir: string): string {
  if (rawPath === '~') {
    return homeDir;
  }
  return rawPath.startsWith('~/') ? path.join(homeDir, rawPath.slice(2)) : rawPath;
}

/**
 * Whether `packageRoot` is the designated installation or lies within it. Both sides are resolved through symlinks
 * first, so a worktree reached by one path and designated by another still matches.
 */
async function matchesDesignatedWriter(packageRoot: string, designatedPath: string): Promise<boolean> {
  const resolvedRoot = await resolveRealPath(packageRoot);
  const resolvedDesignated = await resolveRealPath(designatedPath);
  return resolvedRoot === resolvedDesignated || resolvedRoot.startsWith(resolvedDesignated + path.sep);
}

/**
 * Reads the effective `home-writer` setting from the home domain's declaration chain, the local tier overriding the
 * base one, or `undefined` when no tier sets it. Throws on a value that names no path a comparison could use.
 */
async function readDesignatedWriter(homeDir: string): Promise<DesignatedWriter | undefined> {
  const chain = await resolveScopeChain('codeassembly.yaml', { cwd: homeDir });

  let designated: DesignatedWriter | undefined;
  for (const configPath of chain) {
    const declaration = parseCodeAssemblyFile(await readFile(configPath, 'utf8'), configPath);
    const declared = declaration['home-writer'];
    if (declared === undefined) {
      continue;
    }

    const writerPath = expandHome(declared.trim(), homeDir);
    if (!path.isAbsolute(writerPath)) {
      throw new Error(
        `Invalid \`home-writer\` in ${configPath}: expected an absolute path (a leading \`~\` is expanded), ` +
          `got "${declared}". Remove the key to leave home-domain writes unguarded.`,
      );
    }
    designated = { configPath, writerPath };
  }

  return designated;
}

/**
 * Resolves `targetPath` through symlinks, falling back to a plain absolute resolution for a path that does not exist.
 * A designated worktree that has been deleted still names a location a comparison can answer against.
 */
async function resolveRealPath(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

// endregion | Helpers

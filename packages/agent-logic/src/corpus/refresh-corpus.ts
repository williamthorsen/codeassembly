import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { type RunInput, runInputSchema } from './corpus-schemas.ts';
import { CORPUS_DIRECTORY, RECORDS_DIRECTORY } from './score-corpus.ts';

const buildRecordSchema = z.object({
  lastWrite: z.object({
    version: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceCommit: z.string().min(1),
    command: z.string().min(1),
    writtenAt: z.string().min(1),
  }),
});

// Other plugins' entries are left unchecked, since only the named plugin's fields are read.
const installedPluginsSchema = z.object({ plugins: z.record(z.string(), z.array(z.unknown())) });

const pluginInstallSchema = z.object({
  scope: z.string(),
  installPath: z.string().min(1),
  version: z.string().min(1),
  gitCommitSha: z.string().min(1),
});

/** Reads git's trimmed output for the arguments, run in the directory; throws when git fails. */
export type GitReader = (directory: string, args: string[]) => string;

export interface RefreshOptions {
  corpusDirectory: string;
  /** The home directory under which Claude Code and codeassembly keep their files. */
  home: string;
  readGit: GitReader;
}

/**
 * Copies each prompt that the records directory's `run.json` lists, byte for byte, from the file that Claude Code
 * loads, and writes the provenance of each source into `run.json`. Throws before writing anything when a file is
 * missing, a source is unknown, or a declared source is stale against the deployed build.
 */
export function refreshCorpus({ corpusDirectory, home, readGit }: RefreshOptions): string[] {
  const runFile = path.join(corpusDirectory, RECORDS_DIRECTORY, 'run.json');
  const run = runInputSchema.parse(readJson(runFile));
  const roots = new Map<string, string>();
  const sources: RunInput['sources'] = {};
  for (const [key, source] of Object.entries(run.sources)) {
    if (source.kind === 'plugin') {
      const install = readPluginInstall(home, source.plugin);
      sources[key] = { ...source, version: install.version, commit: install.gitCommitSha };
      roots.set(key, install.installPath);
    } else {
      const build = readBuild(home);
      const buildTop = readGit(expandHome(build.sourcePath, home), ['rev-parse', '--show-toplevel']);
      const declared = source.declared.map((entry) => {
        const directory = expandHome(entry.path, home);
        if (!existsSync(directory))
          throw new Error(`${key}: the declared source ${entry.name} does not exist at ${entry.path}`);
        const pinnedByBuild = readGit(directory, ['rev-parse', '--show-toplevel']) === buildTop;
        const commit = pinnedByBuild
          ? readPinnedCommit(entry.name, directory, build.sourceCommit, readGit)
          : readUnpinnedCommit(entry.name, directory, build.writtenAt, readGit);
        return { ...entry, commit, pinnedByBuild };
      });
      sources[key] = { ...source, build, declared };
      roots.set(key, path.join(home, '.claude'));
    }
  }

  const prompts = Object.entries(run.prompts).map(([name, prompt]) => {
    const root = roots.get(prompt.source);
    if (root === undefined) throw new Error(`${name}: run.json lists no source "${prompt.source}"`);
    const file = path.join(root, prompt.path);
    if (!existsSync(file)) throw new Error(`${name}: the deployed file ${file} does not exist`);
    return { file: path.join(corpusDirectory, `${name}.md`), content: readFileSync(file) };
  });

  const refreshed = runInputSchema.parse({ ...run, sources });
  for (const { file, content } of prompts) writeFileSync(file, content);
  writeFileSync(runFile, `${JSON.stringify(refreshed, undefined, 2)}\n`);
  return prompts.map(({ file }) => file);
}

if (import.meta.main) {
  const written = refreshCorpus({ corpusDirectory: CORPUS_DIRECTORY, home: os.homedir(), readGit: runGit });
  process.stdout.write(
    `refresh-corpus: wrote ${written.length} prompts and ${path.join(CORPUS_DIRECTORY, RECORDS_DIRECTORY, 'run.json')}\n`,
  );
}

// region | Helpers
/** Throws when the source has uncommitted changes, which no recorded commit describes. */
function checkClean(name: string, directory: string, readGit: GitReader) {
  if (readGit(directory, ['status', '--porcelain', '--', '.']) !== '') {
    throw new Error(`${name} has uncommitted changes at ${directory}, so no commit describes what the build deployed`);
  }
}

/** Replaces a leading `~/` with the home directory. */
function expandHome(file: string, home: string): string {
  return file.startsWith('~/') ? path.join(home, file.slice(2)) : file;
}

/** Reads the build record that `codeassembly` writes, with its source path written relative to the home directory. */
function readBuild(home: string) {
  const file = path.join(home, '.codeassembly/home-provenance.json');
  if (!existsSync(file)) throw new Error(`The codeassembly build record ${file} does not exist`);
  const { lastWrite } = buildRecordSchema.parse(readJson(file));
  return { ...lastWrite, sourcePath: toHomePath(lastWrite.sourcePath, home) };
}

/** Reads and parses a JSON file. */
function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Returns the commit of the source that the build pins; throws unless it is the build's commit and clean. */
function readPinnedCommit(name: string, directory: string, buildCommit: string, readGit: GitReader): string {
  const commit = readGit(directory, ['rev-parse', 'HEAD']);
  if (commit !== buildCommit) {
    throw new Error(
      `${name} is at ${commit}, but the deployed build ran from ${buildCommit}; run \`codeassembly sync --global\`, then refresh again`,
    );
  }
  checkClean(name, directory, readGit);
  return commit;
}

/**
 * Returns the last commit that changed a source outside the build's repository; throws when that commit is dated
 * after the build or the source is not clean. A commit dated before the build but checked out after it passes.
 */
function readUnpinnedCommit(name: string, directory: string, writtenAt: string, readGit: GitReader): string {
  const [commit = '', committedAt = ''] = readGit(directory, ['log', '-1', '--format=%H %cI', '--', '.']).split(' ', 2);
  if (commit === '') throw new Error(`${name} has no commit at ${directory}`);
  if (Date.parse(committedAt) > Date.parse(writtenAt)) {
    throw new Error(
      `${name} changed in ${commit} at ${committedAt}, after the deployed build at ${writtenAt}; run \`codeassembly sync --global\`, then refresh again`,
    );
  }
  checkClean(name, directory, readGit);
  return commit;
}

/** Returns the plugin's user-scoped install; throws unless exactly one exists. */
function readPluginInstall(home: string, plugin: string) {
  const file = path.join(home, '.claude/plugins/installed_plugins.json');
  if (!existsSync(file)) throw new Error(`The plugin record ${file} does not exist`);
  const installs = (installedPluginsSchema.parse(readJson(file)).plugins[plugin] ?? [])
    .map((install) => pluginInstallSchema.parse(install))
    .filter((install) => install.scope === 'user');
  const [install] = installs;
  if (install === undefined || installs.length > 1) {
    throw new Error(`${plugin}: expected one user-scoped install, found ${installs.length}`);
  }
  return install;
}

/** Runs git in the directory and returns its trimmed output; throws when git fails. */
function runGit(directory: string, args: string[]): string {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

/** Rewrites a path under the home directory as `~/…`; throws for a path outside it. */
function toHomePath(file: string, home: string): string {
  const relative = path.relative(home, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${file} is outside the home directory`);
  return `~/${relative}`;
}
// endregion | Helpers

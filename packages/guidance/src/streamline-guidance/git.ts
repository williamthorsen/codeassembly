/** The git adapter for the streamline-guidance helper: every git invocation that the helper makes, with its parsing. */
import { execFileSync } from 'node:child_process';

import type { PhraseCommit } from './types.ts';

/** The git queries that the helper makes, each returning parsed values. */
export interface StreamlineGit {
  /** Returns the commits that changed the phrase's occurrence count in `file`, newest first, following renames. */
  findPhraseHistory(root: string, file: string, phrase: string): PhraseCommit[];
  /** Returns git's top-level path for `cwd`, or undefined when `cwd` is not inside a working tree. */
  findTopLevel(cwd: string): string | undefined;
  /** Returns the repository-relative files among `files` that are modified, staged, or untracked. */
  listChangedFiles(root: string, files: readonly string[]): Set<string>;
  /** Lists tracked files and untracked, non-ignored files matching the pathspecs, deduplicated, repository-relative. */
  listFiles(root: string, pathspecs: readonly string[]): string[];
}

/** The adapter that runs git. */
export const realGit: StreamlineGit = {
  findPhraseHistory,
  findTopLevel,
  listChangedFiles,
  listFiles,
};

// region | Helpers

/** Separates one commit's fields in the log format. */
const FIELD_SEPARATOR = '\u{1F}';

/** Output cap for one git invocation, sized to exceed the output of a long history or a large repository's listing. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/** The most commits reported for one phrase. */
const HISTORY_LIMIT = 5;

/** Separates one commit from the next in the log format. */
const RECORD_SEPARATOR = '\u{1E}';

/**
 * Runs `git log -S` on the file. The format is explicit, so a configured `format.pretty` or signature display cannot
 * change what is parsed.
 */
function findPhraseHistory(root: string, file: string, phrase: string): PhraseCommit[] {
  const stdout = runGit(root, [
    'log',
    '--follow',
    '--no-show-signature',
    `--max-count=${HISTORY_LIMIT}`,
    `--format=%H${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`,
    `-S${phrase}`,
    '--',
    file,
  ]);

  return stdout
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ''))
    .filter((record) => record !== '')
    .map((record) => {
      const [sha = '', date = '', subject = '', body = ''] = record.split(FIELD_SEPARATOR);
      return { sha, date, subject, body: body.trim() };
    });
}

/** Runs `git rev-parse --show-toplevel`, treating any failure as being outside a working tree. */
function findTopLevel(cwd: string): string | undefined {
  try {
    return runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return undefined;
  }
}

/** Runs `git status` on the files, returning an empty set without running git when there are none. */
function listChangedFiles(root: string, files: readonly string[]): Set<string> {
  if (files.length === 0) {
    return new Set();
  }
  const stdout = runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...files]);

  const changed = new Set<string>();
  const entries = stdout.split('\u{0}');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] ?? '';
    if (entry.length < 4) continue;
    changed.add(entry.slice(3));
    // A rename or copy entry is followed by its original path, which is not itself an entry.
    if (/[CR]/.test(entry.slice(0, 2))) index += 1;
  }
  return changed;
}

/** Runs both `git ls-files` forms, tracked and untracked-but-not-ignored, and merges their paths. */
function listFiles(root: string, pathspecs: readonly string[]): string[] {
  const listed = [
    ...runLsFiles(root, [], pathspecs),
    ...runLsFiles(root, ['--others', '--exclude-standard'], pathspecs),
  ];
  return [...new Set(listed)];
}

/** Runs git in a directory and returns its stdout, discarding stderr. */
function runGit(cwd: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** Runs one `git ls-files` form in the repository, returning repository-relative paths. */
function runLsFiles(root: string, options: readonly string[], pathspecs: readonly string[]): string[] {
  return runGit(root, ['ls-files', '-z', ...options, '--', ...pathspecs])
    .split('\u{0}')
    .filter((file) => file !== '');
}

// endregion | Helpers

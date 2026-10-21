/** The git adapter for the describe-change helper: every git invocation that the helper makes, with its parsing. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '../lib/type-guards.ts';
import { realGit as sharedGit, type TopLevelResult } from '../shared/git.ts';

/** The git queries that the helper makes, each returning parsed values. */
export interface DescribeChangeGit {
  /** Returns the working-tree root containing `startDir`, or git's own diagnostic when it cannot supply one. */
  findTopLevel(startDir: string): TopLevelResult;
  /** Reports whether `ref` names a commit in the repository at `cwd`. Throws when git cannot read the repository. */
  hasCommit(cwd: string, ref: string): Promise<boolean>;
  /** Returns every non-merge commit in `baseRef..headRef`, oldest first. Throws when git fails. */
  listCommits(cwd: string, baseRef: string, headRef: string): Promise<RawCommit[]>;
}

/** One commit as a branch's consolidation reads it: its hash, its subject, and every `Change:` trailer that it contains. */
export interface RawCommit {
  hash: string;
  subject: string;
  trailers: readonly string[];
}

/** The adapter that runs git. */
export const realGit: DescribeChangeGit = {
  findTopLevel: (startDir) => sharedGit.findTopLevel(startDir),
  hasCommit,
  listCommits,
};

// region | Helpers

const execFileAsync = promisify(execFile);

/** Separates the fields within one commit's record. */
const FIELD = '\u{1F}';

/**
 * Output cap for the log invocation, sized well past a long branch. The 1 MiB default throws `ENOBUFS`, which a caller
 * cannot tell from a branch without commits.
 */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/** The suffix that makes `rev-parse` resolve a ref to the commit that it names, failing when it names none. */
const PEEL_TO_COMMIT = '^{commit}';

/** Separates one commit's record from the next. */
const RECORD = '\u{1E}';

/** Separates one `Change:` trailer from the next within a commit's record. */
const TRAILER = '\u{1D}';

/**
 * Runs `git rev-parse --verify` on the ref. Git exits 1 for a ref that names none and 128 for a repository that it
 * cannot read, so only the first is an answer; any other failure propagates.
 */
async function hasCommit(cwd: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', [
      '-C',
      cwd,
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${ref}${PEEL_TO_COMMIT}`,
    ]);
    return true;
  } catch (error) {
    if (isRecord(error) && error['code'] === 1) {
      return false;
    }
    throw error;
  }
}

/**
 * Runs `git log --reverse --no-merges` over the range.
 *
 * Oldest first makes one order hold across the whole result: A commit's trailers are read in the order they were
 * written. A reverse-chronological walk would run backwards across commits and forwards inside one.
 *
 * A merge commit contributes nothing. Its subject does not match any template and its author cannot rewrite it, so
 * reporting it as unmatched would train a reader to skim the list that exists to be read. The commits brought in by a
 * merge stay in the range on their own.
 *
 * Git parses the trailers itself through `%(trailers:key=Change,valueonly)`. A folded trailer and a trailer block
 * separated from the body by a blank line both read correctly without a scanner of this module's own.
 *
 * The separators are the ASCII separator controls rather than NUL, and they are written here as escapes rather than as
 * literal bytes: A source file or fixture containing one of these raw is skipped by `grep` and mangled by several
 * editors.
 */
async function listCommits(cwd: string, baseRef: string, headRef: string): Promise<RawCommit[]> {
  const format = `%H${FIELD}%s${FIELD}%(trailers:key=Change,valueonly,separator=${TRAILER})${RECORD}`;
  const args = ['-C', cwd, 'log', `${baseRef}..${headRef}`, '--reverse', '--no-merges', `--format=${format}`];
  const { stdout } = await execFileAsync('git', args, { maxBuffer: GIT_MAX_BUFFER });

  const commits: RawCommit[] = [];
  for (const record of stdout.split(RECORD)) {
    const [hash, subject, trailers] = record.split(FIELD);
    if (hash === undefined || subject === undefined || hash.trim() === '') {
      continue;
    }
    commits.push({ hash: hash.trim(), subject, trailers: splitTrailers(trailers) });
  }
  return commits;
}

/** Splits a record's trailer field into its trailers, dropping the empties left behind by a commit containing none. */
function splitTrailers(field: string | undefined): string[] {
  return (field ?? '')
    .split(TRAILER)
    .map((trailer) => trailer.trim())
    .filter((trailer) => trailer !== '');
}

// endregion | Helpers

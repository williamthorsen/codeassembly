import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '../lib/type-guards.ts';

/**
 * Reads every commit in `base..head`, oldest first, reporting each one's subject and its `Change:` trailers. The head
 * defaults to `HEAD`; a pull request's head commit is named instead where the checkout is not that pull request's
 * branch.
 *
 * A head commit absent from the local repository throws `MissingCommitError`, so a caller can proceed without the
 * commits rather than fail as it does on any other git failure.
 *
 * Oldest first is what makes one order hold across the whole result: a commit's trailers are read in the order they
 * were written, so a reverse-chronological walk would run backwards across commits and forwards inside one.
 *
 * A merge commit contributes nothing. Its subject matches no template and its author cannot rewrite it, so reporting
 * it as unmatched would train a reader to skim the list that exists to be read. The commits a merge brought in
 * stay in the range on their own.
 *
 * Git parses the trailers itself through `%(trailers:key=Change,valueonly)`, so a folded trailer and a trailer block
 * separated from the body by a blank line both read correctly without a scanner of this module's own.
 *
 * The separators are the ASCII separator controls rather than NUL, and they are written here as escapes rather than as
 * literal bytes: a source file or fixture holding one of these raw is skipped by `grep` and mangled by several editors.
 */
export async function readCommits(input: { baseRef: string; cwd: string; headRef?: string }): Promise<RawCommit[]> {
  const headRef = input.headRef ?? 'HEAD';
  if (!(await hasCommit(input.cwd, headRef))) {
    throw new MissingCommitError(headRef);
  }

  const format = `%H${FIELD}%s${FIELD}%(trailers:key=Change,valueonly,separator=${TRAILER})${RECORD}`;
  const args = [
    '-C',
    input.cwd,
    'log',
    `${input.baseRef}..${headRef}`,
    '--reverse',
    '--no-merges',
    `--format=${format}`,
  ];
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

/** Thrown where the head of a range names no commit in the local repository, as an unfetched pull-request head does. */
export class MissingCommitError extends Error {
  override readonly name = 'MissingCommitError';
  readonly ref: string;

  constructor(ref: string) {
    super(`${ref} names no commit in the local repository`);
    this.ref = ref;
  }
}

/** One commit as a branch's consolidation reads it: its hash, its subject, and every `Change:` trailer it carries. */
export interface RawCommit {
  hash: string;
  subject: string;
  trailers: readonly string[];
}

// region | Helpers

const execFileAsync = promisify(execFile);

/** Separates the fields within one commit's record. */
const FIELD = '\u{1F}';

/**
 * Output cap for the log invocation, sized well past a long branch. The 1 MiB default throws `ENOBUFS`, which a caller
 * cannot tell from a branch carrying no commits.
 */
const GIT_MAX_BUFFER = 64 * 1_024 * 1_024;

/** The suffix that makes `rev-parse` resolve a ref to the commit it names, failing where it names none. */
const PEEL_TO_COMMIT = '^{commit}';

/** Separates one commit's record from the next. */
const RECORD = '\u{1E}';

/** Separates one `Change:` trailer from the next within a commit's record. */
const TRAILER = '\u{1D}';

/**
 * Reports whether `ref` names a commit in the repository at `cwd`. Git exits 1 for a ref that names none and 128 for a
 * repository it cannot read, so only the first is an answer; any other failure propagates.
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
    if (isRecord(error) && error.code === 1) {
      return false;
    }
    throw error;
  }
}

/** Splits a record's trailer field into its trailers, dropping the empties a commit carrying none leaves behind. */
function splitTrailers(field: string | undefined): string[] {
  return (field ?? '')
    .split(TRAILER)
    .map((trailer) => trailer.trim())
    .filter((trailer) => trailer !== '');
}

// endregion | Helpers

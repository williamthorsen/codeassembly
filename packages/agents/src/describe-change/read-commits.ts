import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Reads every commit in `base..HEAD`, oldest first, reporting each one's subject and its `Change:` trailers.
 *
 * Oldest first is what makes one order hold across the whole result: a commit's trailers are read in the order they
 * were written, so a reverse-chronological walk would run backwards across commits and forwards inside one.
 *
 * A merge commit contributes nothing. Its subject matches no template and its author cannot rewrite it, so reporting
 * it as unclassifiable would train a reader to skim the list that exists to be read. The commits a merge brought in
 * stay in the range on their own.
 *
 * Git parses the trailers itself through `%(trailers:key=Change,valueonly)`, so a folded trailer and a trailer block
 * separated from the body by a blank line both read correctly without a scanner of this module's own.
 *
 * The separators are the ASCII separator controls rather than NUL, and they are written here as escapes rather than as
 * literal bytes: a source file or fixture holding one of these raw is skipped by `grep` and mangled by several editors.
 */
export async function readCommits(input: { baseRef: string; cwd: string }): Promise<RawCommit[]> {
  const format = `%H${FIELD}%s${FIELD}%(trailers:key=Change,valueonly,separator=${TRAILER})${RECORD}`;
  const args = ['-C', input.cwd, 'log', `${input.baseRef}..HEAD`, '--reverse', '--no-merges', `--format=${format}`];
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

/** One commit as the classifier reads it: its hash, its subject, and every `Change:` trailer it carries. */
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

/** Separates one commit's record from the next. */
const RECORD = '\u{1E}';

/** Separates one `Change:` trailer from the next within a commit's record. */
const TRAILER = '\u{1D}';

/** Splits a record's trailer field into its trailers, dropping the empties a commit carrying none leaves behind. */
function splitTrailers(field: string | undefined): string[] {
  return (field ?? '')
    .split(TRAILER)
    .map((trailer) => trailer.trim())
    .filter((trailer) => trailer !== '');
}

// endregion | Helpers

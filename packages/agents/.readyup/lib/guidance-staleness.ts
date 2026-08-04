/**
 * Staleness measurement for the guidance-freshness readyup check.
 *
 * Every `git log` here names its own `--format` or `--pretty`. A global or repository `format.pretty` would
 * otherwise rewrite the output these functions parse, and the check would silently measure nothing.
 */

import { runGit } from 'readyup/check-utils';

const COMMIT_MARKER = 'COMMIT';
/** Files whose commits carry no signal about whether project guidance has drifted. */
const INCIDENTAL_FILE_PATTERN = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

/** How far a guidance file has fallen behind the commits that landed after it. */
export interface GuidanceStaleness {
  readonly lastModifiedEpochSec: number;
  readonly meaningfulCommitCount: number;
}

/**
 * Measures how many meaningful commits landed after `guidancePath` was last modified. Returns undefined when
 * the repository cannot answer: `repoPath` is not a git repository, or the file has no history in it.
 */
export async function readGuidanceStaleness(
  repoPath: string,
  guidancePath: string,
): Promise<GuidanceStaleness | undefined> {
  let stamp: string;
  try {
    stamp = await runGit(repoPath, 'log', '-1', '--format=%H %ct', '--', guidancePath);
  } catch {
    return undefined;
  }
  // A path with no history is not an error: git reports it as empty output and a zero exit.
  const separatorIndex = stamp.indexOf(' ');
  if (separatorIndex === -1) {
    return undefined;
  }
  const commitSha = stamp.slice(0, separatorIndex);
  const lastModifiedEpochSec = Number(stamp.slice(separatorIndex + 1));
  if (!Number.isFinite(lastModifiedEpochSec)) {
    return undefined;
  }
  // Anchor on the commit rather than its timestamp: `--after` includes a commit sharing the boundary second,
  // which would count the guidance update itself among the commits that followed it.
  const log = await runGit(repoPath, 'log', `--pretty=format:${COMMIT_MARKER}`, '--name-only', `${commitSha}..HEAD`);
  return { lastModifiedEpochSec, meaningfulCommitCount: countMeaningfulCommits(log) };
}

/**
 * Counts the commits in a `--pretty=format:COMMIT --name-only` log that touch at least one file other than a
 * package manifest or lockfile.
 */
export function countMeaningfulCommits(log: string): number {
  let count = 0;
  let hasMeaningfulFile = false;
  for (const line of log.split('\n')) {
    if (line === COMMIT_MARKER) {
      if (hasMeaningfulFile) {
        count += 1;
      }
      hasMeaningfulFile = false;
      continue;
    }
    if (line !== '' && !INCIDENTAL_FILE_PATTERN.test(line)) {
      hasMeaningfulFile = true;
    }
  }
  return hasMeaningfulFile ? count + 1 : count;
}

/** Renders a Unix epoch in seconds as a `YYYY-MM-DD` UTC date. */
export function formatUtcDate(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

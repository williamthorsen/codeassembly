import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from './type-guards.ts';

const execFileAsync = promisify(execFile);

/** `git check-ignore`'s exit status for a path it does not ignore, as distinct from a failure to answer at all. */
const NOT_IGNORED_EXIT_CODE = 1;

/**
 * Whether git ignores `filePath` within the repository at `cwd`, or `undefined` when the question cannot be answered
 * — git is absent, `cwd` is not a repository, or the check failed for any other reason. A tracked file answers
 * `false`, since a file already in version control is by definition not ignored. Callers use this to advise, so an
 * indeterminate answer is distinct from a negative one and is meant to stay silent rather than guess.
 */
export async function checkGitIgnored(cwd: string, filePath: string): Promise<boolean | undefined> {
  try {
    await execFileAsync('git', ['-C', cwd, 'check-ignore', '--quiet', filePath]);
    return true;
  } catch (error: unknown) {
    // Any exit other than `NOT_IGNORED_EXIT_CODE`, and a failure to spawn git at all, means the check could not
    // answer — reported as `undefined` so a caller does not read it as "not ignored".
    return isRecord(error) && error.code === NOT_IGNORED_EXIT_CODE ? false : undefined;
  }
}

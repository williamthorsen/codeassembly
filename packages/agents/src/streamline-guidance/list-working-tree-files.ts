import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Lists the repository-relative files that git tracks or would track, matching the given pathspecs, that exist in the
 * working tree. A file deleted from the working tree but still in the index is dropped, since nothing can read it.
 */
export function listWorkingTreeFiles(root: string, pathspecs: readonly string[] = []): string[] {
  const listed = [
    ...runLsFiles(root, [], pathspecs),
    ...runLsFiles(root, ['--others', '--exclude-standard'], pathspecs),
  ];
  return [...new Set(listed)].filter((file) => existsSync(path.join(root, file)));
}

// region | Helpers

/** Output cap for one git listing, sized past what a large repository produces. */
const GIT_MAX_BUFFER = 256 * 1_024 * 1_024;

/** Runs one `git ls-files` form in the repository, returning repository-relative paths. */
function runLsFiles(root: string, options: readonly string[], pathspecs: readonly string[]): string[] {
  return execFileSync('git', ['ls-files', '-z', ...options, '--', ...pathspecs], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .split('\u{0}')
    .filter((file) => file !== '');
}

// endregion | Helpers

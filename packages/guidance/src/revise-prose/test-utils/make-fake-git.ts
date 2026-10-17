import type { ReviseProseGit } from '../git.ts';

/** The fixed answers of a fake git adapter. */
export interface FakeGitAnswers {
  /** Every file that git lists as tracked or untracked and not ignored, repository-relative. */
  files?: readonly string[];
  /** Makes the listing fail, as git does outside a working tree. */
  notARepository?: boolean;
}

/**
 * Builds a git adapter that returns fixed values. Its listing supports the path forms that the sweep passes: `.`,
 * a directory, and a file.
 */
export function makeFakeGit(answers: FakeGitAnswers): ReviseProseGit {
  const files = answers.files ?? [];
  return {
    listFiles: (_root, paths) => {
      if (answers.notARepository === true) throw new Error('fatal: not a git repository');
      return paths.length === 0 ? [...files] : files.filter((file) => paths.some((spec) => matchesPath(file, spec)));
    },
  };
}

// region | Helpers

/** Reports whether a repository-relative file is the path or lies beneath it. */
function matchesPath(file: string, spec: string): boolean {
  const normalized = spec.replace(/\/+$/, '');
  if (normalized === '.' || normalized === '') return true;
  return file === normalized || file.startsWith(`${normalized}/`);
}

// endregion | Helpers

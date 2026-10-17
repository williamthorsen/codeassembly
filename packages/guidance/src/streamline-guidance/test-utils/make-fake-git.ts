import type { StreamlineGit } from '../git.ts';
import type { PhraseCommit } from '../types.ts';

/** The fixed answers of a fake git adapter. */
export interface FakeGitAnswers {
  /** Files that git reports as modified, staged, or untracked. */
  changed?: Iterable<string>;
  /** Every file that git lists as tracked or untracked and not ignored, repository-relative. */
  files?: readonly string[];
  histories?: ReadonlyArray<{ file: string; phrase: string; commits: PhraseCommit[] }>;
  /** The top level of the repository; undefined stands for a working directory outside any repository. */
  topLevel?: string;
}

/**
 * Builds a git adapter that returns fixed values. Its listing honors the pathspec forms that the helper passes:
 * `.`, a directory, and `*name`, which matches a path ending in `name`.
 */
export function makeFakeGit(answers: FakeGitAnswers): StreamlineGit {
  const changed = new Set(answers.changed);
  const files = answers.files ?? [];
  return {
    findPhraseHistory: (_root, file, phrase) =>
      answers.histories?.find((entry) => entry.file === file && entry.phrase === phrase)?.commits ?? [],
    findTopLevel: () => answers.topLevel,
    listChangedFiles: (_root, queried) => new Set(queried.filter((file) => changed.has(file))),
    listFiles: (_root, pathspecs) =>
      pathspecs.length === 0
        ? [...files]
        : files.filter((file) => pathspecs.some((spec) => matchesPathspec(file, spec))),
  };
}

// region | Helpers

/** Reports whether a repository-relative file matches one pathspec form. */
function matchesPathspec(file: string, pathspec: string): boolean {
  if (pathspec === '.') return true;
  if (pathspec.startsWith('*')) return file.endsWith(pathspec.slice(1));
  return file === pathspec || file.startsWith(`${pathspec}/`);
}

// endregion | Helpers

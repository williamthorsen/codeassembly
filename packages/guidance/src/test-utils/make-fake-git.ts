import type { SharedGit, TopLevelResult } from '../shared/git.ts';

/** The fixed answers of a fake shared git adapter. */
export interface FakeGitAnswers {
  /** The checked-out branch; an empty string stands for a detached HEAD. */
  branch?: string;
  /** Errors that the named methods throw in place of answering. */
  errors?: Partial<Record<keyof SharedGit, Error>>;
  /** The remotes, in the order that git lists them. */
  remotes?: ReadonlyArray<{ name: string; url: string }>;
  topLevel?: TopLevelResult;
}

/** Builds an error shaped like the one that `execFile` raises when the git binary is absent. */
export function makeEnoentError(): Error {
  return Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
}

/**
 * Builds a shared git adapter that returns fixed values. An omitted `topLevel` answers as a directory outside any
 * repository, and `findRemoteUrl` throws for a remote that `remotes` does not list, as git does.
 */
export function makeFakeGit(answers: FakeGitAnswers = {}): SharedGit {
  const { errors = {} } = answers;
  const remotes = answers.remotes ?? [];
  return {
    findCurrentBranch: () => answerWith(errors.findCurrentBranch, () => answers.branch ?? 'main'),
    findRemoteUrl: (_cwd, name) =>
      answerWith(errors.findRemoteUrl, () => {
        const remote = remotes.find((entry) => entry.name === name);
        if (remote === undefined) throw new Error(`error: No such remote '${name}'`);
        return remote.url === '' ? undefined : remote.url;
      }),
    findTopLevel: () => {
      if (errors.findTopLevel !== undefined) throw errors.findTopLevel;
      return answers.topLevel ?? { failure: 'fatal: not a git repository' };
    },
    listRemotes: () => answerWith(errors.listRemotes, () => remotes.map((entry) => entry.name)),
  };
}

// region | Helpers

/** Settles with the configured error when there is one, and otherwise with the answer; a thrown answer rejects. */
function answerWith<T>(error: Error | undefined, answer: () => T): Promise<T> {
  if (error !== undefined) return Promise.reject(error);
  return Promise.try(answer);
}

// endregion | Helpers

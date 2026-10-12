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
 * Builds a shared git adapter that answers from fixed values. An omitted `topLevel` answers as a directory outside any
 * repository, and `findRemoteUrl` throws for a remote that `remotes` does not list, as git does.
 */
export function makeFakeGit(answers: FakeGitAnswers = {}): SharedGit {
  const { errors = {} } = answers;
  const remotes = answers.remotes ?? [];
  return {
    findCurrentBranch: async () => {
      if (errors.findCurrentBranch !== undefined) throw errors.findCurrentBranch;
      return answers.branch ?? 'main';
    },
    findRemoteUrl: async (_cwd, name) => {
      if (errors.findRemoteUrl !== undefined) throw errors.findRemoteUrl;
      const remote = remotes.find((entry) => entry.name === name);
      if (remote === undefined) throw new Error(`error: No such remote '${name}'`);
      return remote.url === '' ? undefined : remote.url;
    },
    findTopLevel: () => {
      if (errors.findTopLevel !== undefined) throw errors.findTopLevel;
      return answers.topLevel ?? { failure: 'fatal: not a git repository' };
    },
    listRemotes: async () => {
      if (errors.listRemotes !== undefined) throw errors.listRemotes;
      return remotes.map((entry) => entry.name);
    },
  };
}

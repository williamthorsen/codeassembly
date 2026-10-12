import type { AgentsGit } from '../git.ts';

/**
 * The fixed answers of a fake git adapter. An omitted field answers as git does outside any repository; a function
 * field answers per argument.
 */
export interface FakeGitAnswers {
  /** Whether `HEAD` is an ancestor of the default branch, per working directory. */
  ancestor?: boolean | ((cwd: string) => boolean);
  /** The commit that `HEAD` is on. */
  headCommit?: string;
  /** The files that `HEAD` records, relative to the content root; giving any means `HEAD` is a commit. */
  headFiles?: Readonly<Record<string, Buffer | string>>;
  /** Whether git ignores a path; `undefined` stands for a check that cannot answer. */
  ignored?: boolean | ((filePath: string) => boolean | undefined);
  /** The ref to which `origin/HEAD` points. */
  originHead?: string;
  /** The remotes and their URLs, in git's order; an `Error` stands for git failing, such as when it is absent. */
  remotes?: Readonly<Record<string, string>> | Error;
  /** The working-tree root. */
  topLevel?: string;
  /** The refs that resolve. */
  verifiedRefs?: readonly string[];
}

/** Builds a git adapter that answers from fixed values. */
export function makeFakeGit(answers: FakeGitAnswers = {}): AgentsGit {
  const { headFiles, remotes } = answers;
  return {
    checkIgnored: async (_cwd, filePath) =>
      typeof answers.ignored === 'function' ? answers.ignored(filePath) : answers.ignored,
    findTopLevel: async () => answers.topLevel,
    hasHeadCommit: () => headFiles !== undefined,
    isAncestor: async (cwd) =>
      typeof answers.ancestor === 'function' ? answers.ancestor(cwd) : (answers.ancestor ?? false),
    listHeadFiles: () => {
      if (headFiles === undefined) throw new Error('fake git: HEAD is not a commit');
      return Object.keys(headFiles);
    },
    listRemotes: async () => {
      if (remotes instanceof Error) throw remotes;
      return Object.keys(remotes ?? {});
    },
    readHeadBlob: (_cwd, relativePath) => {
      const contents = headFiles?.[relativePath];
      return contents === undefined ? undefined : Buffer.from(contents);
    },
    readHeadCommit: async () => answers.headCommit,
    readRemoteUrl: async (_cwd, name) => {
      if (remotes instanceof Error) throw remotes;
      return remotes?.[name];
    },
    readSymbolicRef: async (_cwd, ref) => (ref === 'origin/HEAD' ? answers.originHead : undefined),
    verifyRef: async (_cwd, ref) => answers.verifiedRefs?.includes(ref) ?? false,
  };
}

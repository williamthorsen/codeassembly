import type { AgentsGit } from '../git.ts';

/**
 * The fixed answers of a fake git adapter. An omitted field gives callers the answer that they receive outside any
 * repository; a function field answers per argument.
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

/** Builds a git adapter that returns fixed values. */
export function makeFakeGit(answers: FakeGitAnswers = {}): AgentsGit {
  const { headFiles, remotes } = answers;
  return {
    checkIgnored: (_cwd, filePath) =>
      Promise.resolve(typeof answers.ignored === 'function' ? answers.ignored(filePath) : answers.ignored),
    findTopLevel: () => Promise.resolve(answers.topLevel),
    hasHeadCommit: () => headFiles !== undefined,
    isAncestor: (cwd) =>
      Promise.resolve(typeof answers.ancestor === 'function' ? answers.ancestor(cwd) : (answers.ancestor ?? false)),
    listHeadFiles: () => {
      if (headFiles === undefined) throw new Error('fake git: HEAD is not a commit');
      return Object.keys(headFiles);
    },
    listRemotes: () =>
      remotes instanceof Error ? Promise.reject(remotes) : Promise.resolve(Object.keys(remotes ?? {})),
    readHeadBlob: (_cwd, relativePath) => {
      const contents = headFiles?.[relativePath];
      return contents === undefined ? undefined : Buffer.from(contents);
    },
    readHeadCommit: () => Promise.resolve(answers.headCommit),
    readRemoteUrl: (_cwd, name) =>
      remotes instanceof Error ? Promise.reject(remotes) : Promise.resolve(remotes?.[name]),
    readSymbolicRef: (_cwd, ref) => Promise.resolve(ref === 'origin/HEAD' ? answers.originHead : undefined),
    verifyRef: (_cwd, ref) => Promise.resolve(answers.verifiedRefs?.includes(ref) ?? false),
  };
}

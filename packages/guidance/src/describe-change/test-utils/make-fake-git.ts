import type { DescribeChangeGit, RawCommit } from '../git.ts';

/** The fixed answers of a fake git adapter. */
export interface FakeGitAnswers {
  /** The commits that every range lists, oldest first. */
  commits?: readonly RawCommit[];
  /** The refs that name a commit; when absent, every ref does. */
  knownRefs?: Iterable<string>;
  /** The working-tree root; undefined stands for a directory outside any repository. */
  topLevel?: string;
}

/** A fake git adapter, with the head refs that its range listings received. */
export interface FakeGit extends DescribeChangeGit {
  listedHeads: string[];
}

/** Builds a git adapter that answers from fixed values. */
export function makeFakeGit(answers: FakeGitAnswers = {}): FakeGit {
  const knownRefs = answers.knownRefs === undefined ? undefined : new Set(answers.knownRefs);
  const listedHeads: string[] = [];
  return {
    findTopLevel: () =>
      answers.topLevel === undefined ? { failure: 'fatal: not a git repository' } : { root: answers.topLevel },
    hasCommit: (_cwd, ref) => Promise.resolve(knownRefs?.has(ref) ?? true),
    listCommits: (_cwd, _baseRef, headRef) => {
      listedHeads.push(headRef);
      return Promise.resolve([...(answers.commits ?? [])]);
    },
    listedHeads,
  };
}

/**
 * Builds the commit that git would report for a message: its first line as the subject, and the value of each line
 * starting `Change:` as a trailer.
 */
export function makeRawCommit(message: string, index: number): RawCommit {
  const [subject = '', ...rest] = message.split('\n');
  const trailers = rest.filter((line) => line.startsWith('Change:')).map((line) => line.slice('Change:'.length).trim());
  return { hash: `fake-commit-${index}`, subject, trailers };
}

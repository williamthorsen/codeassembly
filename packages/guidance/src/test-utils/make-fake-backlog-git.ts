import type { BacklogGit, Worktree } from '../groom-backlog/git.ts';
import type { Commit } from '../groom-backlog/types.ts';

/** The fixed answers of a fake backlog git adapter. */
export interface FakeBacklogGitAnswers {
  /** Commits ahead, by the `base..ref` range that git takes; an unlisted range counts zero. */
  commitsAhead?: Readonly<Record<string, number>>;
  commits?: readonly Commit[];
  commonDir?: string;
  originHead?: string;
  /** The full refs that exist beyond the branch tips. */
  refs?: readonly string[];
  shortSha?: string;
  /** Each branch's tip committer date, by full ref name. */
  tips?: Readonly<Record<string, string>>;
  worktrees?: readonly Worktree[];
}

/**
 * Builds a git adapter that returns fixed values. A missing `commonDir` or `shortSha` rejects, as git would fail;
 * every other missing answer reads as absent.
 */
export function makeFakeBacklogGit(answers: FakeBacklogGitAnswers): BacklogGit {
  const tips = new Map(Object.entries(answers.tips ?? {}));
  return {
    countCommitsAhead: (_cwd, base, ref) => Promise.resolve(answers.commitsAhead?.[`${base}..${ref}`] ?? 0),
    findCommonDir: () => resolveAnswer(answers.commonDir, 'commonDir'),
    findOriginHead: () => Promise.resolve(answers.originHead),
    findShortSha: () => resolveAnswer(answers.shortSha, 'shortSha'),
    hasRef: (_cwd, ref) => Promise.resolve(tips.has(ref) || (answers.refs ?? []).includes(ref)),
    listBranchTips: () => Promise.resolve(new Map(tips)),
    listCommitsSince: () => Promise.resolve([...(answers.commits ?? [])]),
    listWorktrees: () => Promise.resolve([...(answers.worktrees ?? [])]),
  };
}

// region | Helpers

/** Resolves to the answer, or rejects when the fake was not given one. */
function resolveAnswer<T>(answer: T | undefined, name: string): Promise<T> {
  return answer === undefined ? Promise.reject(new Error(`fake git: ${name} not set`)) : Promise.resolve(answer);
}

// endregion | Helpers

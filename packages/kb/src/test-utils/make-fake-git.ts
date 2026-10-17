import type { GitAnswer, KbGit } from '../git/git.ts';

/** The fixed answers of a fake git adapter, keyed by the method that returns each. */
export interface FakeGitAnswers {
  findMergeBase?: GitAnswer<string>;
  findTopLevel?: GitAnswer<string>;
  listChangedFiles?: GitAnswer<string[]>;
  /** The scope for every root; absent means `undefined`, as outside a working tree. */
  listScope?: ReadonlySet<string>;
}

/**
 * Builds a git adapter that returns fixed values. A missing answer is the one that git gives outside a working
 * tree, except `listChangedFiles`, which defaults to an empty change set.
 */
export function makeFakeGit(answers: FakeGitAnswers = {}): KbGit {
  return {
    findMergeBase: () => answers.findMergeBase ?? NOT_A_REPOSITORY,
    findTopLevel: () => answers.findTopLevel ?? NOT_A_REPOSITORY,
    listChangedFiles: () => answers.listChangedFiles ?? { ok: true, value: [] },
    listScope: () => answers.listScope,
  };
}

// region | Helpers

const NOT_A_REPOSITORY = { ok: false, message: 'fatal: not a git repository' } as const;

// endregion | Helpers

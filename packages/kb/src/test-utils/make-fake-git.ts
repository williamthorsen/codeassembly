import type { GitAnswer, KbGit } from '../git/git.ts';

/** The fixed answers of a fake git adapter, keyed by the method that returns each. */
export interface FakeGitAnswers {
  findMergeBase?: GitAnswer<string>;
  findTopLevel?: GitAnswer<string>;
  listChangedFiles?: GitAnswer<string[]>;
  /** One scope for every root, or a scope per root; a root without one gets `undefined`, as outside a working tree. */
  listScope?: ReadonlySet<string> | ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Builds a git adapter that answers from fixed values. A missing answer is the one that git gives outside a working
 * tree, except `listChangedFiles`, which defaults to an empty change set.
 */
export function makeFakeGit(answers: FakeGitAnswers = {}): KbGit {
  const { listScope } = answers;
  return {
    findMergeBase: () => answers.findMergeBase ?? NOT_A_REPOSITORY,
    findTopLevel: () => answers.findTopLevel ?? NOT_A_REPOSITORY,
    listChangedFiles: () => answers.listChangedFiles ?? { ok: true, value: [] },
    listScope: ({ root }) => (listScope instanceof Map ? listScope.get(root) : listScope),
  };
}

// region | Helpers

const NOT_A_REPOSITORY = { ok: false, message: 'fatal: not a git repository' } as const;

// endregion | Helpers

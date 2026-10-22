import { makeFakeGit } from '../../test-utils/make-fake-git.ts';

/** A git adapter for a working directory without any remote. */
export const NO_REMOTE_GIT = makeFakeGit();

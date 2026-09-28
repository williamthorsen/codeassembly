// Merges a GitHub pull request through `gh`, confirms the merge, and deletes the head branch on request.
//
// Every `gh` call goes through the injected runner as an argument array, so a title or path never reaches a shell.

import { isRecord } from '../lib/type-guards.ts';

/** How the head branch deletion ended. */
export type BranchDeletion = 'already-deleted' | 'by-gh' | 'deleted' | 'failed' | 'not-requested';

export type DeletionStrategy = 'both' | 'none' | 'remote';

/** What one `gh` invocation reported. */
export interface GhResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** A merge that did not complete; `stderr` is written verbatim and the process exits with `exitCode`. */
export interface MergeFailure {
  ok: false;
  exitCode: number;
  stderr: string;
}

export type MergeOutcome = MergeFailure | MergeSuccess;

export interface MergeRequest {
  /** Absolute path to the merge-commit body; read by `gh` for `squash` and `merge`, and ignored for `rebase`. */
  bodyPath: string | undefined;
  deletionStrategy: DeletionStrategy;
  prNumber: number;
  strategy: MergeStrategy;
  /** Merge-commit subject; used for `squash`, and ignored otherwise. */
  title: string | undefined;
}

/** The result printed on stdout. */
export interface MergeResult {
  branchDeletion: BranchDeletion;
  headRefName: string;
  mergeCommit: { oid: string };
  mergedAt: string;
  url: string;
}

export type MergeStrategy = 'merge' | 'rebase' | 'squash';

export interface MergeSuccess {
  ok: true;
  result: MergeResult;
  /** Lines to write to stderr; the merge still succeeded. */
  warnings: string[];
}

export type RunGh = (args: readonly string[]) => Promise<GhResult>;

const VIEW_FIELDS = 'state,mergeCommit,url,mergedAt,headRefName,headRepository,headRepositoryOwner';

/**
 * Merges the pull request, confirms that it is `MERGED`, and, for the `remote` deletion strategy, deletes its head ref
 * on the head repository. A deletion failure is a warning, never a merge failure.
 */
export async function mergePullRequest(request: MergeRequest, runGh: RunGh): Promise<MergeOutcome> {
  const merge = await runGh(buildMergeArgs(request));
  if (merge.exitCode !== 0) {
    return { ok: false, exitCode: merge.exitCode, stderr: merge.stderr };
  }

  const view = await runGh(['pr', 'view', String(request.prNumber), '--json', VIEW_FIELDS]);
  if (view.exitCode !== 0) {
    return {
      ok: false,
      exitCode: view.exitCode,
      stderr: `PR #${request.prNumber} merge ran, but its state could not be read; branch not deleted.\n${view.stderr}`,
    };
  }
  const merged = parseMergedView(view.stdout);
  if (merged.kind === 'unreadable') {
    return {
      ok: false,
      exitCode: 1,
      stderr: `PR #${request.prNumber} merge ran, but its state could not be read; branch not deleted.\n`,
    };
  }
  if (merged.kind === 'not-merged') {
    return {
      ok: false,
      exitCode: 1,
      stderr: `PR #${request.prNumber} is ${merged.state} after merge; branch not deleted.\n`,
    };
  }

  const warnings: string[] = [];
  const branchDeletion = await deleteHeadBranch(request.deletionStrategy, merged, runGh, warnings);

  return {
    ok: true,
    result: {
      branchDeletion,
      headRefName: merged.headRefName,
      mergeCommit: { oid: merged.oid },
      mergedAt: merged.mergedAt,
      url: merged.url,
    },
    warnings,
  };
}

// region | Helpers

interface MergedView {
  kind: 'merged';
  headOwner: string | undefined;
  headRefName: string;
  headRepo: string | undefined;
  mergedAt: string;
  oid: string;
  url: string;
}

type ParsedView = MergedView | { kind: 'not-merged'; state: string } | { kind: 'unreadable' };

/** Returns the `gh pr merge` argument array for the request. */
function buildMergeArgs(request: MergeRequest): string[] {
  const args = ['pr', 'merge', String(request.prNumber), `--${request.strategy}`];
  if (request.strategy === 'squash' && request.title !== undefined) {
    args.push('--subject', request.title);
  }
  if (request.strategy !== 'rebase' && request.bodyPath !== undefined) {
    args.push('--body-file', request.bodyPath);
  }
  if (request.deletionStrategy === 'both') {
    args.push('--delete-branch');
  }
  return args;
}

/** Deletes the head ref when the strategy is `remote` and reports how the deletion ended. */
async function deleteHeadBranch(
  deletionStrategy: DeletionStrategy,
  merged: MergedView,
  runGh: RunGh,
  warnings: string[],
): Promise<BranchDeletion> {
  if (deletionStrategy === 'none') {
    return 'not-requested';
  }
  if (deletionStrategy === 'both') {
    return 'by-gh';
  }
  // A deleted fork leaves no repository to hold the ref.
  if (merged.headOwner === undefined || merged.headRepo === undefined) {
    return 'already-deleted';
  }

  const refPath = merged.headRefName.split('/').map(encodeURIComponent).join('/');
  const endpoint = `repos/${encodeURIComponent(merged.headOwner)}/${encodeURIComponent(merged.headRepo)}/git/refs/heads/${refPath}`;
  const deletion = await runGh(['api', '-X', 'DELETE', endpoint]);
  if (deletion.exitCode === 0) {
    return 'deleted';
  }
  if (deletion.stderr.includes('HTTP 422') && deletion.stderr.includes('Reference does not exist')) {
    return 'already-deleted';
  }
  warnings.push(`warning: Failed to delete remote branch '${merged.headRefName}': ${deletion.stderr.trim()}`);
  return 'failed';
}

/** Parses the post-merge `gh pr view` JSON into the fields that confirm the merge and locate the head ref. */
function parseMergedView(stdout: string): ParsedView {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { kind: 'unreadable' };
  }
  if (!isRecord(parsed) || typeof parsed.state !== 'string') {
    return { kind: 'unreadable' };
  }
  if (parsed.state !== 'MERGED') {
    return { kind: 'not-merged', state: parsed.state };
  }
  const { headRefName, mergeCommit, mergedAt, url } = parsed;
  const oid = isRecord(mergeCommit) ? mergeCommit.oid : undefined;
  if (
    typeof headRefName !== 'string' ||
    typeof mergedAt !== 'string' ||
    typeof oid !== 'string' ||
    typeof url !== 'string'
  ) {
    return { kind: 'unreadable' };
  }
  return {
    kind: 'merged',
    headOwner: readNamedField(parsed.headRepositoryOwner, 'login'),
    headRefName,
    headRepo: readNamedField(parsed.headRepository, 'name'),
    mergedAt,
    oid,
    url,
  };
}

/** Returns the `login` or `name` string of a `gh` repository or owner object, or `undefined` when it is absent. */
function readNamedField(value: unknown, key: 'login' | 'name'): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
}

// endregion | Helpers

/** Reads the repository's identity and its open issues through `gh` and `git`. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import type { CommandRunner, Issue } from './types.ts';

const execFileAsync = promisify(execFile);

/** The most issues that one `collect` reads; a backlog past it is swept in more than one run. */
export const ISSUE_FETCH_LIMIT = 5_000;

const IssueListSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    url: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    labels: z.array(z.object({ name: z.string() })),
    comments: z.array(
      z.object({
        author: z.object({ login: z.string() }).nullable(),
        body: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
);

const RepoViewSchema = z.object({
  nameWithOwner: z.string().min(1),
  defaultBranchRef: z.object({ name: z.string() }).nullable(),
});

/** The repository's GitHub name and its default branch. */
export interface RepositoryInfo {
  defaultBranch: string;
  nameWithOwner: string;
}

/** Runs a command through `execFile`, with a buffer large enough for a whole backlog's JSON. */
export const runCommand: CommandRunner = async (command, args, cwd) => {
  const { stdout } = await execFileAsync(command, [...args], { cwd, maxBuffer: 512 * 1_024 * 1_024 });
  return stdout;
};

/** Fetches every open issue with its labels and comments. */
export async function fetchOpenIssues(run: CommandRunner, root: string): Promise<Issue[]> {
  const stdout = await run(
    'gh',
    [
      'issue',
      'list',
      '--state',
      'open',
      '--limit',
      String(ISSUE_FETCH_LIMIT),
      '--json',
      'number,title,body,url,createdAt,updatedAt,labels,comments',
    ],
    root,
  );
  return IssueListSchema.parse(JSON.parse(stdout)).map((issue) => ({
    body: issue.body,
    comments: issue.comments.map((comment) => ({
      author: comment.author?.login ?? 'ghost',
      body: comment.body,
      createdAt: comment.createdAt,
    })),
    createdAt: issue.createdAt,
    labels: issue.labels.map((label) => label.name),
    number: issue.number,
    title: issue.title,
    updatedAt: issue.updatedAt,
    url: issue.url,
  }));
}

/**
 * Resolves the repository's GitHub name and default branch. The default branch is read from `origin/HEAD` first,
 * which costs no API call, and from GitHub when the remote does not record one.
 */
export async function resolveRepository(run: CommandRunner, root: string): Promise<RepositoryInfo> {
  const view = RepoViewSchema.parse(
    JSON.parse(await run('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], root)),
  );
  const fromOrigin = await readOriginHead(run, root);
  const defaultBranch = fromOrigin ?? view.defaultBranchRef?.name;
  if (defaultBranch === undefined || defaultBranch === '') {
    throw new Error('could not resolve the default branch from origin/HEAD or from GitHub');
  }
  return { defaultBranch, nameWithOwner: view.nameWithOwner };
}

/** Resolves the short SHA of `HEAD`. */
export async function resolveShortSha(run: CommandRunner, root: string): Promise<string> {
  return (await run('git', ['rev-parse', '--short', 'HEAD'], root)).trim();
}

// region | Helpers

/** Returns the branch to which `origin/HEAD` points, or `undefined` when the remote does not record one. */
async function readOriginHead(run: CommandRunner, root: string): Promise<string | undefined> {
  try {
    const ref = (await run('git', ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], root)).trim();
    const prefix = 'refs/remotes/origin/';
    return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined;
  } catch {
    return undefined;
  }
}

// endregion | Helpers

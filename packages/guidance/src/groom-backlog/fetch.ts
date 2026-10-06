/** Reads the repository's identity, its issues, pull requests, and milestones through `gh` and `git`. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { z } from 'zod';

import type { CommandRunner, Issue } from './types.ts';

const execFileAsync = promisify(execFile);

/** The most issues that one `collect` reads; a backlog past it is swept in more than one run. */
export const ISSUE_FETCH_LIMIT = 5_000;

/** The `gh issue` fields that every fetch requests, relations included; `gh` 2.100 is the first to return them all. */
const ISSUE_FIELDS =
  'number,title,body,url,state,createdAt,updatedAt,closedAt,labels,comments,assignees,milestone,parent,blockedBy,subIssuesSummary';

const IssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string(),
  url: z.string(),
  state: z.enum(['OPEN', 'CLOSED']),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().nullable(),
  labels: z.array(z.object({ name: z.string() })),
  comments: z.array(
    z.object({
      author: z.object({ login: z.string() }).nullable(),
      body: z.string(),
      createdAt: z.string(),
    }),
  ),
  assignees: z.array(z.object({ login: z.string() })),
  milestone: z.object({ title: z.string(), dueOn: z.string().nullable() }).nullable(),
  parent: z.object({ number: z.number().int().positive() }).nullable(),
  blockedBy: z.object({ nodes: z.array(z.object({ number: z.number().int().positive() })) }),
  subIssuesSummary: z.object({ completed: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
});

const MilestoneListSchema = z.array(
  z.array(
    z.object({
      number: z.number().int().positive(),
      title: z.string(),
      due_on: z.string().nullable(),
      state: z.enum(['open', 'closed']),
    }),
  ),
);

const RepoViewSchema = z.object({
  nameWithOwner: z.string().min(1),
  defaultBranchRef: z.object({ name: z.string() }).nullable(),
});

/** A milestone of the repository. */
export interface Milestone {
  dueOn: string | null;
  number: number;
  state: 'closed' | 'open';
  title: string;
}

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

/** Fetches one issue, open or closed, with its relations. */
export async function fetchIssue(run: CommandRunner, root: string, number: number): Promise<Issue> {
  const stdout = await run('gh', ['issue', 'view', String(number), '--json', ISSUE_FIELDS], root);
  return toIssue(IssueSchema.parse(JSON.parse(stdout)));
}

/** Fetches the repository's milestones, open and closed. */
export async function fetchMilestones(run: CommandRunner, root: string): Promise<Milestone[]> {
  const stdout = await run(
    'gh',
    ['api', '--paginate', '--slurp', 'repos/{owner}/{repo}/milestones?state=all&per_page=100'],
    root,
  );
  return MilestoneListSchema.parse(JSON.parse(stdout))
    .flat()
    .map((milestone) => ({
      dueOn: milestone.due_on,
      number: milestone.number,
      state: milestone.state,
      title: milestone.title,
    }));
}

/** Fetches every open issue with its labels, comments, and relations. */
export async function fetchOpenIssues(run: CommandRunner, root: string): Promise<Issue[]> {
  const stdout = await run(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', String(ISSUE_FETCH_LIMIT), '--json', ISSUE_FIELDS],
    root,
  );
  return parseIssueList(JSON.parse(stdout));
}

/** Parses `gh issue list` output into issues. */
export function parseIssueList(json: unknown): Issue[] {
  return z.array(IssueSchema).parse(json).map(toIssue);
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

/** Maps a parsed `gh` issue onto `Issue`, reducing each relation to issue numbers. */
function toIssue(issue: z.infer<typeof IssueSchema>): Issue {
  return {
    assignees: issue.assignees.map((assignee) => assignee.login),
    blockedBy: issue.blockedBy.nodes.map((node) => node.number),
    body: issue.body,
    closedAt: issue.closedAt,
    comments: issue.comments.map((comment) => ({
      author: comment.author?.login ?? 'ghost',
      body: comment.body,
      createdAt: comment.createdAt,
    })),
    createdAt: issue.createdAt,
    labels: issue.labels.map((label) => label.name),
    milestone: issue.milestone,
    number: issue.number,
    parent: issue.parent?.number ?? null,
    state: issue.state === 'OPEN' ? 'open' : 'closed',
    subIssues: issue.subIssuesSummary,
    title: issue.title,
    updatedAt: issue.updatedAt,
    url: issue.url,
  };
}

// endregion | Helpers

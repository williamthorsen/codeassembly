/**
 * Finds the merged pull requests and default-branch commits that may do each ticket's work. The pass reads the PRs in
 * one `gh` call and the commits in one `git log` call, and matches text only: It prefilters for the assessor, which
 * verifies each candidate.
 */
import { z } from 'zod';

import type { CommandRunner, CrossReference, Issue } from './types.ts';

/** The most merged pull requests that one pass reads. */
export const PR_FETCH_LIMIT = 5_000;

const KIND_ORDER = { 'closing-pr': 0, 'pr-mention': 1, 'commit-mention': 2 } as const;

const PullRequestListSchema = z.array(
  z.object({
    number: z.number().int().positive(),
    title: z.string(),
    body: z.string(),
    mergedAt: z.string(),
    closingIssuesReferences: z.array(
      z.object({
        number: z.number().int().positive(),
        repository: z.object({ name: z.string(), owner: z.object({ login: z.string() }) }),
      }),
    ),
  }),
);

/** A merged pull request as the pass reads it. */
export type PullRequest = z.infer<typeof PullRequestListSchema>[number];

/** A default-branch commit as the pass reads it. */
export interface Commit {
  date: string;
  sha: string;
  subject: string;
}

/** Returns each issue's candidates, closing PRs first, then mentioning PRs, then commits, each oldest first. */
export async function findCrossReferences(input: {
  defaultBranch: string;
  issues: readonly Issue[];
  nameWithOwner: string;
  root: string;
  run: CommandRunner;
}): Promise<Map<number, CrossReference[]>> {
  const { defaultBranch, issues, nameWithOwner, root, run } = input;
  const since = issues.map((issue) => issue.createdAt).toSorted()[0];
  if (since === undefined) return new Map();

  const pullRequests = PullRequestListSchema.parse(
    JSON.parse(
      await run(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'merged',
          '--limit',
          String(PR_FETCH_LIMIT),
          '--search',
          `merged:>=${since.slice(0, 10)}`,
          '--json',
          'number,title,body,mergedAt,closingIssuesReferences',
        ],
        root,
      ),
    ),
  );
  const commits = parseCommits(
    await run('git', ['log', defaultBranch, `--since=${since}`, '--format=%h%x1f%s%x1f%cI'], root),
  );
  return matchCrossReferences({ commits, issues, nameWithOwner, pullRequests });
}

/** Matches the PRs and commits against each issue by closing reference and by `#N` token. */
export function matchCrossReferences(input: {
  commits: readonly Commit[];
  issues: readonly Issue[];
  nameWithOwner: string;
  pullRequests: readonly PullRequest[];
}): Map<number, CrossReference[]> {
  const result = new Map<number, CrossReference[]>();
  for (const issue of input.issues) {
    const token = buildTokenPattern(issue.number);
    const createdAt = Date.parse(issue.createdAt);
    const found: CrossReference[] = [];
    for (const pr of input.pullRequests) {
      if (Date.parse(pr.mergedAt) < createdAt) continue;
      const closes = pr.closingIssuesReferences.some(
        (reference) =>
          reference.number === issue.number &&
          `${reference.repository.owner.login}/${reference.repository.name}` === input.nameWithOwner,
      );
      if (closes || token.test(pr.title) || token.test(pr.body)) {
        found.push({
          date: pr.mergedAt,
          kind: closes ? 'closing-pr' : 'pr-mention',
          ref: `#${pr.number}`,
          title: pr.title,
        });
      }
    }
    for (const commit of input.commits) {
      if (Date.parse(commit.date) < createdAt || !token.test(commit.subject)) continue;
      found.push({ date: commit.date, kind: 'commit-mention', ref: commit.sha, title: commit.subject });
    }
    result.set(
      issue.number,
      found.toSorted((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || Date.parse(a.date) - Date.parse(b.date)),
    );
  }
  return result;
}

// region | Helpers

/**
 * Builds a pattern matching `#N` as a token: not preceded by a word character, a slash, or `#` (which would make it
 * another repository's reference or part of a longer token), and not followed by a digit.
 */
function buildTokenPattern(number: number): RegExp {
  return new RegExp(String.raw`(?<![\w/#])#${number}(?!\d)`);
}

/** Parses `git log` output written with unit-separated short SHA, subject, and committer date. */
function parseCommits(output: string): Commit[] {
  const commits: Commit[] = [];
  for (const line of output.split('\n')) {
    const [sha, subject, date] = line.split('\u{1F}', 3);
    if (sha !== undefined && sha !== '' && subject !== undefined && date !== undefined) {
      commits.push({ date, sha, subject });
    }
  }
  return commits;
}

// endregion | Helpers

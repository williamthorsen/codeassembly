/**
 * The `check-tracked` command's checks: which proposals a prior triage already disposed of, or an open or declined
 * issue already covers, so that the synthesis reports them as tracked rather than ranking them again.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { z } from 'zod';

import { type EvidenceBlock, parseEvidenceBlock } from '../triage-spike-findings/evidence.ts';
import type { CommandRunner } from '../triage-spike-findings/types.ts';
import type { Proposal } from './schemas.ts';

/** The processes and files that the check reads, injected so that tests can supply fixtures. */
export interface TrackedDependencies {
  run: CommandRunner;
  /** Reports whether any of `paths` changed between `commit` and `HEAD`, or undefined when git cannot tell. */
  changedSince(root: string, commit: string, paths: readonly string[]): boolean | undefined;
  readFile(file: string): string;
}

/** A proposal that is already tracked, with where and why. */
export interface TrackedMatch {
  id: string;
  key: string;
  /** `#N` for an issue, or the path of a `--prior` file. */
  source: string;
  reason: string;
}

/** The classification of every proposal, and whether the tracker could be searched. */
export interface TrackedReport {
  tracker: { checked: boolean; reason: string | null };
  tracked: TrackedMatch[];
  untracked: string[];
}

/** The visible heading with which every rendered dispositions comment opens, used to find those comments. */
export const DISPOSITIONS_HEADING = 'Dispositions of the findings of';

/** The most issues that one tracker search reads. */
export const SEARCH_LIMIT = 100;

/** The adapter that runs `git diff --quiet` and reads files from disk. */
export const realTrackedDependencies: Omit<TrackedDependencies, 'run'> = {
  changedSince(root, commit, paths) {
    const result = spawnSync('git', ['-C', root, 'diff', '--quiet', commit, 'HEAD', '--', ...paths]);
    if (result.status === 0) return false;
    if (result.status === 1) return true;
    return;
  },
  readFile(file) {
    return readFileSync(file, 'utf8');
  },
};

/**
 * Classifies each proposal. Evidence blocks come from the `prior` files and, when the repository is on GitHub, from
 * the dispositions comments on its issues; a block's match lapses when a path that it names changed after its commit.
 * An open issue, or one closed as not planned, whose body contains the key verbatim also tracks the proposal.
 */
export async function checkTracked(
  proposals: readonly Proposal[],
  prior: readonly string[],
  root: string,
  dependencies: TrackedDependencies,
): Promise<TrackedReport> {
  const blocks: Array<{ source: string; block: EvidenceBlock }> = [];
  for (const file of prior) {
    const block = parseEvidenceBlock(dependencies.readFile(file));
    if (block !== undefined) blocks.push({ source: file, block });
  }

  let tracker: TrackedReport['tracker'] = { checked: true, reason: null };
  let issuesByKey = new Map<string, IssueSummary>();
  try {
    const repo = RepoSchema.parse(
      JSON.parse(await dependencies.run('gh', ['repo', 'view', '--json', 'nameWithOwner'], root)),
    ).nameWithOwner;
    blocks.push(...(await readTrackerBlocks(dependencies.run, root, repo)));
    issuesByKey = await findIssuesByKey(proposals, dependencies.run, root);
  } catch (error) {
    tracker = { checked: false, reason: `the GitHub tracker could not be read: ${describeError(error)}` };
  }

  const report: TrackedReport = { tracker, tracked: [], untracked: [] };
  for (const proposal of proposals) {
    const match =
      findBlockMatch(proposal, blocks, root, dependencies) ?? findIssueMatch(proposal, issuesByKey.get(proposal.key));
    if (match === undefined) report.untracked.push(proposal.id);
    else report.tracked.push(match);
  }
  return report;
}

// region | Helpers

/** An issue whose body names a proposal's key. */
interface IssueSummary {
  number: number;
  state: string;
}

const IssueListSchema = z.array(
  z.object({
    number: z.number().int(),
    body: z.string(),
    state: z.string(),
    stateReason: z.string().nullable().optional(),
  }),
);

const RepoSchema = z.object({ nameWithOwner: z.string().min(1) });

const SearchResultSchema = z.array(z.object({ number: z.number().int() }));

const CommentsSchema = z.object({ comments: z.array(z.object({ body: z.string() })) });

/** Returns the first prior disposition of the proposal's key whose paths have not changed since its commit. */
function findBlockMatch(
  proposal: Proposal,
  blocks: ReadonlyArray<{ source: string; block: EvidenceBlock }>,
  root: string,
  dependencies: TrackedDependencies,
): TrackedMatch | undefined {
  for (const { source, block } of blocks) {
    const item = block.items.find((candidate) => candidate.key === proposal.key);
    if (item === undefined) continue;
    const changed = dependencies.changedSince(root, block.commit, item.paths);
    if (changed === true) continue;
    const where = item.where === null ? '' : ` (${typeof item.where === 'number' ? `#${item.where}` : item.where})`;
    const unknown = changed === undefined ? '; git could not compare its paths with that commit' : '';
    return {
      id: proposal.id,
      key: proposal.key,
      source,
      reason: `triage of #${block.triageTicket} disposed of it as ${item.disposition}${where} at ${block.commit.slice(0, 12)}${unknown}`,
    };
  }
  return undefined;
}

/** Returns a match for an open or not-planned issue whose body contains the key. */
function findIssueMatch(proposal: Proposal, issue: IssueSummary | undefined): TrackedMatch | undefined {
  if (issue === undefined) return undefined;
  return {
    id: proposal.id,
    key: proposal.key,
    source: `#${issue.number}`,
    reason: issue.state === 'OPEN' ? 'an open issue names the key' : 'an issue closed as not planned names the key',
  };
}

/** Searches the tracker once per distinct key, keeping the first open or not-planned issue whose body contains it. */
async function findIssuesByKey(
  proposals: readonly Proposal[],
  run: CommandRunner,
  root: string,
): Promise<Map<string, IssueSummary>> {
  const found = new Map<string, IssueSummary>();
  const keys = new Set(proposals.map((proposal) => proposal.key));
  for (const key of keys) {
    const stdout = await run(
      'gh',
      [
        'issue',
        'list',
        '--state',
        'all',
        '--limit',
        String(SEARCH_LIMIT),
        '--search',
        `"${key.replaceAll('"', '')}" in:body`,
        '--json',
        'number,body,state,stateReason',
      ],
      root,
    );
    const issue = IssueListSchema.parse(JSON.parse(stdout)).find(
      (candidate) =>
        candidate.body.includes(key) && (candidate.state === 'OPEN' || candidate.stateReason === 'NOT_PLANNED'),
    );
    if (issue !== undefined) found.set(key, { number: issue.number, state: issue.state });
  }
  return found;
}

/** Reads the evidence blocks of every dispositions comment on the issues of `repo`. */
async function readTrackerBlocks(
  run: CommandRunner,
  root: string,
  repo: string,
): Promise<Array<{ source: string; block: EvidenceBlock }>> {
  const search = await run(
    'gh',
    [
      'search',
      'issues',
      `"${DISPOSITIONS_HEADING}"`,
      '--repo',
      repo,
      '--match',
      'comments',
      '--limit',
      String(SEARCH_LIMIT),
      '--json',
      'number',
    ],
    root,
  );
  const blocks: Array<{ source: string; block: EvidenceBlock }> = [];
  const issues = SearchResultSchema.parse(JSON.parse(search));
  for (const { number } of issues) {
    const view = await run('gh', ['issue', 'view', String(number), '--json', 'comments'], root);
    const { comments } = CommentsSchema.parse(JSON.parse(view));
    for (const comment of comments) {
      const block = parseEvidenceBlock(comment.body);
      if (block !== undefined) blocks.push({ source: `#${number}`, block });
    }
  }
  return blocks;
}

// endregion | Helpers

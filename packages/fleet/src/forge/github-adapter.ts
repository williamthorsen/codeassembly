// The GitHub forge adapter: satisfies `ForgeAdapter` by shelling out to `gh --json` and normalizing its output at this
// boundary, so nothing downstream sees a `gh`-specific shape. The `gh` process is reached through an injected runner —
// an `execFile`-shaped seam — so tests drive the adapter with fixture JSON captured from real `gh` output, and CI needs
// no `gh` binary.
//
// Call volume is bounded across polls by two per-repo caches. A merged or closed pull request is terminal: it is cached
// and never re-viewed, so steady state is ~1 `pr list` per repo plus 1 `issue view` per ticket. A branch with no pull
// request is remembered as a stable absence and skipped, with a periodic re-check that catches a pull request opened and
// merged entirely between probes — an open one is caught immediately by the next `pr list`.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getOrCreate, retainKeys } from '../common/maps.ts';
import type {
  CheckState,
  ForgeAdapter,
  PrFacts,
  PrState,
  RepoState,
  RepoStateRequest,
  ReviewState,
  TicketFacts,
} from './adapter.ts';

/** Runs a process and resolves its captured output, rejecting with an error carrying its `stderr` on non-zero exit. */
export type ProcessRunner = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

/** The `--json` field set requested for every pull-request query, shared so `pr list` and `pr view` parse alike. */
const PR_JSON_FIELDS = 'number,title,url,state,isDraft,headRefName,statusCheckRollup,reviewDecision';

/** The `--json` field set requested for every ticket query. */
const ISSUE_JSON_FIELDS = 'title,state,url,createdAt,labels';

/** Polls between re-checks of branches remembered as having no pull request. */
const ABSENCE_RECHECK_INTERVAL = 10;

/** Output cap for a single `gh` invocation, generous against large check rollups so a busy repo never truncates. */
const MAX_OUTPUT_BYTES = 10_000_000;

/**
 * Creates a GitHub-backed forge adapter. `runProcess` overrides the default `gh` runner — the test seam — and
 * production omits it. The adapter holds per-repo caches across calls, so a single instance should serve the whole run.
 */
export function createGithubAdapter(input: { runProcess?: ProcessRunner } = {}): ForgeAdapter {
  const runProcess = input.runProcess ?? runProcessDefault;
  const terminalPrsByRepo = new Map<string, Map<string, PrFacts>>();
  const absentBranchesByRepo = new Map<string, Set<string>>();
  const pollCountByRepo = new Map<string, number>();

  async function fetchRepoState(request: RepoStateRequest): Promise<RepoState> {
    const { repo } = request;
    const requestedBranches = new Set(request.branches);
    const terminalPrs = getOrCreate(terminalPrsByRepo, repo, () => new Map<string, PrFacts>());
    const absentBranches = getOrCreate(absentBranchesByRepo, repo, () => new Set<string>());

    // Bound the caches to resident lanes, then periodically forget remembered absences so a late-appearing pull request
    // is re-probed rather than skipped forever.
    retainKeys(terminalPrs, requestedBranches);
    retainMembers(absentBranches, requestedBranches);
    const pollCount = (pollCountByRepo.get(repo) ?? 0) + 1;
    pollCountByRepo.set(repo, pollCount);
    if (pollCount % ABSENCE_RECHECK_INTERVAL === 0) {
      absentBranches.clear();
    }

    const listed = await runProcess('gh', ['pr', 'list', '--repo', repo, '--state', 'open', '--json', PR_JSON_FIELDS]);
    const openPrs = parseOpenPrs(listed.stdout);

    const branchPrs: Record<string, PrFacts> = {};
    for (const branch of request.branches) {
      const open = openPrs[branch];
      if (open !== undefined) {
        // A reopened or freshly recreated branch supersedes any cached terminal or absent verdict.
        branchPrs[branch] = open;
        terminalPrs.delete(branch);
        absentBranches.delete(branch);
        continue;
      }
      const terminal = terminalPrs.get(branch);
      if (terminal !== undefined) {
        branchPrs[branch] = terminal;
        continue;
      }
      if (absentBranches.has(branch)) {
        continue;
      }
      const viewed = await viewBranchPr(runProcess, repo, branch);
      if (viewed === undefined) {
        absentBranches.add(branch);
        continue;
      }
      branchPrs[branch] = viewed;
      if (viewed.state !== 'open') {
        terminalPrs.set(branch, viewed);
      }
    }

    const tickets: Record<string, TicketFacts> = {};
    for (const ticketId of request.ticketIds) {
      const ticket = await viewTicket(runProcess, repo, ticketId);
      if (ticket !== undefined) {
        tickets[ticketId] = ticket;
      }
    }

    return { branchPrs, tickets };
  }

  return { fetchRepoState };
}

// region | Helpers

/** Thrown when `gh` output cannot be parsed into the expected shape — surfaced to the poller as a repo-level failure. */
class ForgeParseError extends Error {}

/** Classifies one `statusCheckRollup` entry, discriminating a `CheckRun` (`status`) from a `StatusContext` (`state`). */
function classifyCheck(entry: unknown): CheckState {
  if (!isRecord(entry)) {
    return 'pending';
  }
  const status = entry.status;
  if (typeof status === 'string') {
    if (status !== 'COMPLETED') {
      return 'pending';
    }
    return classifyConclusion(entry.conclusion);
  }
  return classifyStatusState(entry.state);
}

/** Maps a completed `CheckRun` conclusion to a verdict; an unrecognized conclusion is treated as still pending. */
function classifyConclusion(conclusion: unknown): CheckState {
  switch (conclusion) {
    case 'SUCCESS':
    case 'NEUTRAL':
    case 'SKIPPED':
      return 'passing';
    case 'FAILURE':
    case 'TIMED_OUT':
    case 'CANCELLED':
    case 'ACTION_REQUIRED':
    case 'STARTUP_FAILURE':
    case 'STALE':
      return 'failing';
    default:
      return 'pending';
  }
}

/** Maps a `StatusContext` state to a verdict; `PENDING`, `EXPECTED`, and anything unrecognized read as pending. */
function classifyStatusState(state: unknown): CheckState {
  switch (state) {
    case 'SUCCESS':
      return 'passing';
    case 'FAILURE':
    case 'ERROR':
      return 'failing';
    default:
      return 'pending';
  }
}

/** True when a `gh issue view` failure means the number resolves to no issue, rather than a repo-level fault. */
function isMissingIssueError(error: unknown): boolean {
  return /could not resolve/i.test(readErrorText(error));
}

/** True when a `gh pr view` failure means the branch has no pull request, rather than a repo-level fault. */
function isNoPullRequestError(error: unknown): boolean {
  return /no (?:open )?pull requests found/i.test(readErrorText(error));
}

/** Narrows to a non-array object so field reads over parsed JSON stay type-safe. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Rolls a `statusCheckRollup` array up to one verdict — failing dominates pending dominates passing; empty is none. */
function normalizeChecks(rollup: unknown): CheckState | undefined {
  if (!Array.isArray(rollup) || rollup.length === 0) {
    return undefined;
  }
  let sawPending = false;
  for (const entry of rollup) {
    const verdict = classifyCheck(entry);
    if (verdict === 'failing') {
      return 'failing';
    }
    if (verdict === 'pending') {
      sawPending = true;
    }
  }
  return sawPending ? 'pending' : 'passing';
}

/** Extracts label names from a `gh` labels array, tolerating both `{ name }` objects and bare strings. */
function normalizeLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const labels: string[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      labels.push(entry);
    } else if (isRecord(entry) && typeof entry.name === 'string') {
      labels.push(entry.name);
    }
  }
  return labels;
}

/** Normalizes one raw `gh` pull-request object into `PrFacts`, throwing when required fields are missing or mistyped. */
function normalizePr(raw: unknown): PrFacts {
  if (!isRecord(raw)) {
    throw new ForgeParseError('pull-request payload was not an object');
  }
  const { number, title, url } = raw;
  if (typeof number !== 'number' || typeof title !== 'string' || typeof url !== 'string') {
    throw new ForgeParseError('pull-request payload is missing required fields');
  }
  return {
    number,
    title,
    url,
    state: normalizePrState(raw.state),
    isDraft: raw.isDraft === true,
    checks: normalizeChecks(raw.statusCheckRollup),
    review: normalizeReview(raw.reviewDecision),
  };
}

/** Maps a `gh` pull-request state to the normalized union, throwing on an unrecognized value. */
function normalizePrState(raw: unknown): PrState {
  switch (raw) {
    case 'OPEN':
      return 'open';
    case 'MERGED':
      return 'merged';
    case 'CLOSED':
      return 'closed';
    default:
      throw new ForgeParseError(`unexpected pull-request state: ${String(raw)}`);
  }
}

/** Maps a `gh` `reviewDecision` to the normalized union; an empty or absent decision is `undefined`. */
function normalizeReview(raw: unknown): ReviewState | undefined {
  switch (raw) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes-requested';
    case 'REVIEW_REQUIRED':
      return 'review-required';
    default:
      return undefined;
  }
}

/** Normalizes one raw `gh` issue object into `TicketFacts`, throwing when required fields are missing or mistyped. */
function normalizeTicket(raw: unknown): TicketFacts {
  if (!isRecord(raw)) {
    throw new ForgeParseError('issue payload was not an object');
  }
  const { title, url, createdAt, state } = raw;
  if (typeof title !== 'string' || typeof url !== 'string' || typeof createdAt !== 'string') {
    throw new ForgeParseError('issue payload is missing required fields');
  }
  if (typeof state !== 'string') {
    throw new ForgeParseError('issue payload is missing a state');
  }
  return { title, state: state.toLowerCase(), url, createdAt, labels: normalizeLabels(raw.labels) };
}

/** Parses `gh pr list` output into a branch→facts map, throwing on a non-array payload or an entry without a branch. */
function parseOpenPrs(stdout: string): Record<string, PrFacts> {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) {
    throw new ForgeParseError('pr list output was not an array');
  }
  const byBranch: Record<string, PrFacts> = {};
  for (const entry of parsed) {
    if (!isRecord(entry) || typeof entry.headRefName !== 'string') {
      throw new ForgeParseError('pr list entry is missing its branch name');
    }
    byBranch[entry.headRefName] = normalizePr(entry);
  }
  return byBranch;
}

/** The human-readable text a thrown value carries, joining any captured `stderr` with the error message for matching. */
function readErrorText(error: unknown): string {
  const parts: string[] = [];
  if (isRecord(error) && typeof error.stderr === 'string') {
    parts.push(error.stderr);
  }
  if (error instanceof Error) {
    parts.push(error.message);
  }
  return parts.length > 0 ? parts.join('\n') : String(error);
}

/** Drops every set member absent from `keep`, bounding the set to the currently resident set. */
function retainMembers<T>(set: Set<T>, keep: ReadonlySet<T>): void {
  for (const member of set) {
    if (!keep.has(member)) {
      set.delete(member);
    }
  }
}

/** The default runner: `gh` via `execFile`, with a generous output cap for large check rollups. */
const runProcessDefault: ProcessRunner = async (command, args) => {
  const { stdout, stderr } = await promisify(execFile)(command, [...args], { maxBuffer: MAX_OUTPUT_BYTES });
  return { stdout, stderr };
};

/** Resolves a branch's pull request via `gh pr view`, returning `undefined` for the clean no-pull-request case. */
async function viewBranchPr(runProcess: ProcessRunner, repo: string, branch: string): Promise<PrFacts | undefined> {
  try {
    const { stdout } = await runProcess('gh', ['pr', 'view', branch, '--repo', repo, '--json', PR_JSON_FIELDS]);
    return normalizePr(JSON.parse(stdout));
  } catch (error) {
    if (isNoPullRequestError(error)) {
      return undefined;
    }
    throw error;
  }
}

/** Resolves a ticket via `gh issue view`, returning `undefined` when the number resolves to no issue. */
async function viewTicket(runProcess: ProcessRunner, repo: string, ticketId: string): Promise<TicketFacts | undefined> {
  try {
    const { stdout } = await runProcess('gh', ['issue', 'view', ticketId, '--repo', repo, '--json', ISSUE_JSON_FIELDS]);
    return normalizeTicket(JSON.parse(stdout));
  } catch (error) {
    if (isMissingIssueError(error)) {
      return undefined;
    }
    throw error;
  }
}

// endregion | Helpers

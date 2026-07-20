// The forge-agnostic contract the poller depends on. A forge adapter maps a repo's branches to their pull-request facts
// and a repo's ticket ids to their ticket facts in one batched, per-repo call. GitHub (via `gh`) is the first
// implementation; a Bitbucket one for the work machine can satisfy this same interface without touching any consumer.
//
// Absence follows lifecycle's convention here: an unknown or not-applicable value is `undefined`, and the wire layer
// spells it `null` at snapshot derivation. A branch with no pull request is simply absent from `branchPrs` rather than
// a present-but-null entry — `noUncheckedIndexedAccess` surfaces that as `undefined` on lookup.

/** Whether a pull request is open, merged, or closed unmerged. */
export type PrState = 'open' | 'merged' | 'closed';

/** The rolled-up CI verdict for a pull request. */
export type CheckState = 'passing' | 'failing' | 'pending';

/** The review decision for a pull request. */
export type ReviewState = 'approved' | 'changes-requested' | 'review-required';

/** Normalized pull-request facts for one branch. */
export interface PrFacts {
  number: number;
  title: string;
  url: string;
  state: PrState;
  isDraft: boolean;
  /** The rolled-up CI verdict, or `undefined` when the pull request reports no checks. */
  checks: CheckState | undefined;
  /** The review decision, or `undefined` when review is not required and no decision has been made. */
  review: ReviewState | undefined;
}

/** The minimal forge-portable ticket core: enough to attribute and label a lane, with no forge-specific fields. */
export interface TicketFacts {
  title: string;
  /** The forge's own state vocabulary, lowercased — `open`/`closed` on GitHub, potentially richer elsewhere. */
  state: string;
  url: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  labels: string[];
}

/** One repo's branches and numeric ticket ids to resolve in a single batched fetch. */
export interface RepoStateRequest {
  repo: string;
  branches: readonly string[];
  ticketIds: readonly string[];
}

/** The facts one repo fetch resolves: pull requests keyed by branch, tickets keyed by id. An absent key carries no facts. */
export interface RepoState {
  branchPrs: Record<string, PrFacts>;
  tickets: Record<string, TicketFacts>;
}

/** A forge behind a batched, per-repo fetch — the sole seam between the poller and a concrete forge (GitHub, Bitbucket). */
export interface ForgeAdapter {
  /** Resolves the requested branches' pull requests and ticket ids' facts for `repo`. Throws on repo-level failure. */
  fetchRepoState(request: RepoStateRequest): Promise<RepoState>;
}

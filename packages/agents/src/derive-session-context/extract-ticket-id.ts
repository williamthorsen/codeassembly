/**
 * Extract a ticket ID from a branch name per the contract in `_data/ticket-id-extraction.md`.
 *
 * Tries the Jira-style pattern first (case-insensitive `[A-Za-z]{2,}-[0-9]+`, uppercased on
 * output). Falls back to a bare-numeric match anchored at the start of the branch name,
 * formatted using the resolved `project.ticket_ref_prefix`.
 */
import type { TicketIdResult } from './types.ts';

/**
 * Jira-style pattern: two or more letters, hyphen, one or more digits, case-insensitive.
 * Deliberately unanchored so author-prefixed branches (e.g., `wt/MAC-130`) match correctly.
 * The greedy `[0-9]+` boundary stops at the first non-digit, so `.N` sub-ticket suffixes and
 * `-description` suffixes are naturally truncated.
 */
const JIRA_STYLE_PATTERN = /[A-Za-z]{2,}-[0-9]+/;

/** Bare-numeric prefix: one or more digits anchored at the start of the branch name. */
const BARE_NUMERIC_PATTERN = /^[0-9]+/;

/** Pull-request sentinel: `PR-` followed by digits, matched against the canonical uppercased id. */
const PR_IDENTIFIER_PATTERN = /^PR-[0-9]+$/;

/**
 * Returns the ticket ID and display ref for `branchName`, given the resolved
 * `project.ticket_ref_prefix` (or `undefined` when none is configured).
 *
 * Returns `{ ticket_id: null, ticket_ref: null }` when no ID can be derived.
 *
 * - When the Jira-style match wins, `ticket_ref` equals `ticket_id` (the prefix is part of the canonical ID).
 * - When the bare-numeric fallback wins and `ticketRefPrefix` is `'#'`, `ticket_id` is the bare
 *   number and `ticket_ref` is `'#' + ticket_id` — `#` is a GitHub display convention and never
 *   appears in returned IDs.
 * - When the bare-numeric fallback wins and `ticketRefPrefix` is a Jira-style prefix (e.g., `MAC-`),
 *   both `ticket_id` and `ticket_ref` equal `prefix + number`.
 * - When no prefix is configured, both equal the bare number.
 */
export function extractTicketId(input: { branchName: string; ticketRefPrefix?: string }): TicketIdResult {
  const jiraMatch = input.branchName.match(JIRA_STYLE_PATTERN);
  if (jiraMatch !== null) {
    const id = jiraMatch[0].toUpperCase();
    return { ticket_id: id, ticket_ref: id };
  }

  const bareMatch = input.branchName.match(BARE_NUMERIC_PATTERN);
  if (bareMatch === null) {
    return { ticket_id: null, ticket_ref: null };
  }
  const bareNumber = bareMatch[0];

  const prefix = input.ticketRefPrefix;
  if (prefix === '#') {
    // The `#` is a display-only convention; the canonical ID is the bare number.
    return { ticket_id: bareNumber, ticket_ref: `#${bareNumber}` };
  }
  if (prefix !== undefined && prefix !== '') {
    const id = `${prefix}${bareNumber}`;
    return { ticket_id: id, ticket_ref: id };
  }
  return { ticket_id: bareNumber, ticket_ref: bareNumber };
}

/**
 * Returns the numeric part of a `PR-<n>` sentinel id (e.g. `PR-950` → `950`), or `null` when `id` is
 * not a PR identifier. Operates on the canonical uppercased form extraction produces.
 */
export function extractPrNumber(id: string | null): string | null {
  if (id === null || !PR_IDENTIFIER_PATTERN.test(id)) {
    return null;
  }
  return id.slice('PR-'.length);
}

/**
 * Whether `id` is a pull-request sentinel (`PR-<n>`) standing in for a ticket rather than a ticket ID.
 * Matches the canonical uppercased form that extraction produces; `null` is not a PR identifier.
 */
export function isPrIdentifier(id: string | null): boolean {
  return id !== null && PR_IDENTIFIER_PATTERN.test(id);
}

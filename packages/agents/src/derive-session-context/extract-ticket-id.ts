/**
 * Extract a ticket ID from a branch name per the contract in `_data/ticket-id-extraction.md`.
 *
 * The revisit ordinal `parseTicketRef` captures is dropped: session context attributes to the parent ticket.
 */
import { parseTicketRef } from 'codeassembly-lifecycle';

import type { TicketIdResult } from './types.ts';

/** Bare-numeric id — the form the configured `ticket_ref_prefix` applies to; a Jira-style key carries its own. */
const BARE_NUMERIC_ID_PATTERN = /^[0-9]+$/;

const PR_IDENTIFIER_PATTERN = /^PR-[0-9]+$/;

/**
 * Returns the ticket ID and display ref for `branchName`, given the resolved `project.ticket_ref_prefix`. The two
 * differ only under a `#` prefix, a GitHub display convention that never appears in a returned ID. Both are null when
 * no ID can be derived.
 */
export function extractTicketId(input: { branchName: string; ticketRefPrefix?: string }): TicketIdResult {
  const ref = parseTicketRef(input.branchName);
  if (ref === undefined) {
    return { ticket_id: null, ticket_ref: null };
  }
  if (!BARE_NUMERIC_ID_PATTERN.test(ref.ticketId)) {
    return { ticket_id: ref.ticketId, ticket_ref: ref.ticketId };
  }

  const prefix = input.ticketRefPrefix;
  if (prefix === '#') {
    return { ticket_id: ref.ticketId, ticket_ref: `#${ref.ticketId}` };
  }
  if (prefix !== undefined && prefix !== '') {
    const id = `${prefix}${ref.ticketId}`;
    return { ticket_id: id, ticket_ref: id };
  }
  return { ticket_id: ref.ticketId, ticket_ref: ref.ticketId };
}

/**
 * Returns the numeric part of a `PR-<n>` sentinel id (e.g. `PR-950` → `950`), or `null` when `id` is not a PR
 * identifier.
 */
export function extractPrNumber(id: string | null): string | null {
  if (id === null || !PR_IDENTIFIER_PATTERN.test(id)) {
    return null;
  }
  return id.slice('PR-'.length);
}

/**
 * Whether `id` is a pull-request sentinel (`PR-<n>`) standing in for a ticket rather than a ticket ID. Matches the
 * canonical uppercased form that extraction produces.
 */
export function isPrIdentifier(id: string | null): boolean {
  return id !== null && PR_IDENTIFIER_PATTERN.test(id);
}

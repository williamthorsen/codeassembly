/** Decides whether a merge closed the last open child of an open parent, which `merge-pr` then offers to close. */
import type { Issue } from './types.ts';

/** How many times the ticket is read while it still reads as open. */
const TICKET_READS = 3;

/** The pause between reads of a ticket that still reads as open, in milliseconds. */
const TICKET_READ_INTERVAL_MS = 2_000;

/** The parent of the merged ticket, with its children's counts and its unchecked criteria. */
export interface ParentSummary {
  completed: number;
  number: number;
  state: Issue['state'];
  title: string;
  total: number;
  uncheckedCriteria: string[];
}

/** The merged ticket's state, its parent, and whether to offer to close the parent. */
export interface ParentStatus {
  offer: boolean;
  parent: ParentSummary | null;
  ticket: number;
  ticketState: Issue['state'];
}

/**
 * Reads ticket `ticket` and its parent. GitHub closes a ticket a moment after the merge that closes it, so a ticket
 * that reads as open is read again, `TICKET_READS` times in all.
 */
export async function readParentStatus(
  fetchIssue: (number: number) => Promise<Issue>,
  ticket: number,
  sleep: (milliseconds: number) => Promise<void> = waitFor,
): Promise<ParentStatus> {
  let child = await fetchIssue(ticket);
  for (let read = 1; read < TICKET_READS && child.state === 'open'; read++) {
    await sleep(TICKET_READ_INTERVAL_MS);
    child = await fetchIssue(ticket);
  }
  if (child.parent === null) return { offer: false, parent: null, ticket, ticketState: child.state };

  const parentIssue = await fetchIssue(child.parent);
  const parent: ParentSummary = {
    completed: parentIssue.subIssues.completed,
    number: parentIssue.number,
    state: parentIssue.state,
    title: parentIssue.title,
    total: parentIssue.subIssues.total,
    uncheckedCriteria: extractUncheckedCriteria(parentIssue.body),
  };
  return { offer: shouldOfferParentClose(child.state, parent), parent, ticket, ticketState: child.state };
}

/** Returns the text of each unchecked `- [ ]` item in `body`, except the umbrella's "Every child is closed" criterion. */
export function extractUncheckedCriteria(body: string): string[] {
  return body
    .split('\n')
    .flatMap((line) => /^\s*[-*] \[ \] (.+?)\s*$/.exec(line)?.[1] ?? [])
    .filter((text) => !/^every child is closed\.?$/i.test(text));
}

/** Returns whether the closed ticket was the last open child of an open parent. */
export function shouldOfferParentClose(ticketState: Issue['state'], parent: ParentSummary): boolean {
  return ticketState === 'closed' && parent.state === 'open' && parent.total > 0 && parent.completed === parent.total;
}

// region | Helpers

/** Resolves after `milliseconds`. */
async function waitFor(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// endregion | Helpers

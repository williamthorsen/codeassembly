// Ticket attribution for a lane, derived from its sanitized branch name. Branch-name parsing is the first of two
// attribution layers: a non-conforming name yields no ref here, leaving a forge adapter free to resolve the branch to
// a PR-minted synthetic ref instead. Writers never compute attribution; a lane with neither resolution renders
// without a ticket rollup rather than breaking.

/** A ticket attribution parsed from a conforming branch name. */
export interface TicketRef {
  /** The ticket id, as spelled in the branch name. */
  ticketId: string;
  /** The revisit ordinal, present when the branch names a return visit to the ticket. */
  revisit?: number;
}

/** A conforming branch name: a ticket id, optionally suffixed with a revisit ordinal (`984`, `984.2`). */
const CONFORMING_BRANCH = /^(?<ticketId>\d+)(?:\.(?<revisit>\d+))?$/;

/** Parses `sanitizedBranch` into a ticket ref, or `undefined` when the name does not conform. */
export function parseTicketRef(sanitizedBranch: string): TicketRef | undefined {
  const groups = CONFORMING_BRANCH.exec(sanitizedBranch)?.groups;
  if (groups?.ticketId === undefined) {
    return undefined;
  }
  const { ticketId, revisit } = groups;
  return { ticketId, ...(revisit !== undefined && { revisit: Number(revisit) }) };
}

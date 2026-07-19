// Branch-name ticket parsing per the contract in the agents skills' `_data/ticket-id-extraction.md`: a Jira-style key
// anywhere in the name wins, then a bare-numeric prefix, each with an optional `.N` revisit suffix. Raw and sanitized
// branch spellings parse alike: neither pattern depends on `/` vs `-` separators.

/** A ticket attribution parsed from a branch name. */
export interface TicketRef {
  /** The canonical ticket id: an uppercased Jira-style key (`MAC-130`) or a bare number (`984`), as encoded. */
  ticketId: string;
  /** The revisit ordinal, present when the id carries a `.N` suffix (`984.2`, `NMR-567.2`). */
  revisit?: number;
}

/**
 * Jira-style key: two or more letters, hyphen, digits. Unanchored so author-prefixed branches (`wt/MAC-130`) match;
 * the digit run ends at the first non-digit.
 */
const JIRA_STYLE_PATTERN = /(?<ticketId>[A-Za-z]{2,}-[0-9]+)(?:\.(?<revisit>[0-9]+))?/;

/** Bare-numeric ticket id anchored at the start of the branch name (`984`, `984.2-fix`, `147/feat/foo`). */
const BARE_NUMERIC_PATTERN = /^(?<ticketId>[0-9]+)(?:\.(?<revisit>[0-9]+))?/;

/**
 * Parses `branch` into a ticket ref, or `undefined` when the name encodes no ticket id. Jira-style keys are
 * uppercased to their canonical spelling; a `PR-<n>` name parses as a Jira-style key.
 */
export function parseTicketRef(branch: string): TicketRef | undefined {
  const jira = JIRA_STYLE_PATTERN.exec(branch)?.groups;
  if (jira?.ticketId !== undefined) {
    return composeTicketRef(jira.ticketId.toUpperCase(), jira.revisit);
  }

  const bare = BARE_NUMERIC_PATTERN.exec(branch)?.groups;
  if (bare?.ticketId !== undefined) {
    return composeTicketRef(bare.ticketId, bare.revisit);
  }
  return undefined;
}

// region | Helpers

/** Assembles a ref from a matched id and the optional revisit capture. */
function composeTicketRef(ticketId: string, revisit: string | undefined): TicketRef {
  return { ticketId, ...(revisit !== undefined && { revisit: Number(revisit) }) };
}

// endregion | Helpers

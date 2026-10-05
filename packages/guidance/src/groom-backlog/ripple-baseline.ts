/**
 * The baseline from which closed tickets count as pending a ripple, and the groom runs that set it: the latest `pull`
 * record, else the latest `policy` record of a groom that applied its decisions.
 */
import type { LedgerRecord } from './schemas.ts';
import type { Issue } from './types.ts';

/** The suffix that the skill appends to a dry run's run id. */
export const DRY_RUN_SUFFIX = '-dry-run';

/** The prefix of a ripple's run id, `ripple-{N}`. */
export const RIPPLE_RUN_PREFIX = 'ripple-';

/** The ledger's latest `pull` and groom `policy` timestamps, and the tickets that already have a `ripple` record. */
export interface RippleLedgerState {
  lastPolicy: string | undefined;
  lastPull: string | undefined;
  rippled: Set<number>;
}

/** A closed ticket pending a ripple, as `pending-ripples` and `survey` list it. */
export interface PendingRipple {
  closedAt: string | null;
  number: number;
  title: string;
}

/**
 * Returns whether `record` is the policy of a groom that applied its decisions: neither a ripple, which assesses one
 * ticket's related set, nor a dry run, which applies nothing.
 */
export function isGroomPolicy(record: LedgerRecord): record is Extract<LedgerRecord, { kind: 'policy' }> {
  return record.kind === 'policy' && !record.run.startsWith(RIPPLE_RUN_PREFIX) && !record.run.endsWith(DRY_RUN_SUFFIX);
}

/** Reads the ledger's ripple baseline candidates and the tickets that have rippled. */
export function readRippleLedgerState(records: readonly LedgerRecord[]): RippleLedgerState {
  const rippled = new Set<number>();
  let lastPull: string | undefined;
  let lastPolicy: string | undefined;
  for (const record of records) {
    if (record.kind === 'ripple') rippled.add(record.number);
    else if (record.kind === 'pull') lastPull = record.recordedAt;
    else if (isGroomPolicy(record)) lastPolicy = record.recordedAt;
  }
  return { lastPolicy, lastPull, rippled };
}

/** Returns the tickets of `closed` that closed at or after `since` and lack a `ripple` record, by number. */
export function selectPendingRipples(
  closed: readonly Issue[],
  since: string,
  rippled: ReadonlySet<number>,
): PendingRipple[] {
  return closed
    .filter(
      (issue) =>
        issue.closedAt !== null && Date.parse(issue.closedAt) >= Date.parse(since) && !rippled.has(issue.number),
    )
    .toSorted((a, b) => a.number - b.number)
    .map(summarizePending);
}

/** Returns the fields by which a closed ticket pending a ripple is listed. */
export function summarizePending(issue: Issue): PendingRipple {
  return { closedAt: issue.closedAt, number: issue.number, title: issue.title };
}

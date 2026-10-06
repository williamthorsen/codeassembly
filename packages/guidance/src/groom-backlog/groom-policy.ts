/**
 * Recognizes the `policy` record of a groom that applied its decisions, which marks the backlog's last groom. The ledger
 * also contains the policies of dry runs and, from earlier runs, of ripples, and neither of them is a groom.
 */
import type { LedgerRecord } from './schemas.ts';

/** The suffix that the skill appends to a dry run's run id. */
export const DRY_RUN_SUFFIX = '-dry-run';

/** The prefix of a ripple's run id, `ripple-{N}`, which earlier runs wrote. */
export const RIPPLE_RUN_PREFIX = 'ripple-';

/**
 * Returns whether `record` is the policy of a groom that applied its decisions: neither a ripple, which assessed one
 * ticket's related set, nor a dry run, which applies nothing.
 */
export function isGroomPolicy(record: LedgerRecord): record is Extract<LedgerRecord, { kind: 'policy' }> {
  return record.kind === 'policy' && !record.run.startsWith(RIPPLE_RUN_PREFIX) && !record.run.endsWith(DRY_RUN_SUFFIX);
}

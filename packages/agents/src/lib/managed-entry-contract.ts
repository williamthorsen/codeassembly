/**
 * The result shape shared by the utilities that remove CodeAssembly-owned entries from harness config files, one per
 * config format, so that their callers handle every format alike.
 */

/** Outcome of a remove pass, counting the owned entries deleted. */
export interface RemoveResult {
  readonly changed: boolean;
  readonly removedCount: number;
}

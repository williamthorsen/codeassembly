/**
 * The ensure/check/remove contract shared by every managed-entry utility, one per harness config format. Each utility
 * supplies its own entry type and its own implementation; these shapes are what keeps the harness wiring uniform
 * across them.
 */

/** Whether a supplied entry is installed as given, installed with differing content, or not installed at all. */
export type ManagedEntryStatus = 'present' | 'drifted' | 'absent';

/** One supplied entry paired with its installed status. */
export interface EntryCheck<TEntry> {
  readonly entry: TEntry;
  readonly status: ManagedEntryStatus;
}

/** Outcome of an ensure pass; `changed` is false when the entries were already installed as supplied. */
export interface EnsureResult {
  readonly changed: boolean;
}

/** Outcome of a remove pass, counting the owned entries deleted. */
export interface RemoveResult {
  readonly changed: boolean;
  readonly removedCount: number;
}

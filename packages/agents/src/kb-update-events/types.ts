import type { EventImpact } from '@williamthorsen/kb/records';

export type OperationName = 'add-addressed-by' | 'retag' | 'set-impact';

/**
 * Parsed command-line invocation. `store` is `null` when `--store` was omitted, which the resolver refuses with
 * `missing-store`; `ids` holds the event ids to which the operation applies.
 */
export type ParsedArgs =
  | { operation: 'add-addressed-by'; store: string | null; ids: string[]; references: string[] }
  | { operation: 'retag'; store: string | null; ids: string[]; tags: string[] }
  | { operation: 'set-impact'; store: string | null; ids: string[]; impact: EventImpact };

/** Per-event outcome, in the order the ids were supplied. */
export type EventResult =
  { ok: true; id: string; path: string } | { ok: false; id: string; error: EventErrorCode; message: string };

/** Categorical per-event error codes. */
export type EventErrorCode = 'invalid-id' | 'not-found' | 'parse' | 'validation';

/** The helper's stdout payload when the batch ran. */
export interface UpdateBatchSuccess {
  ok: true;
  operation: OperationName;
  /** Registry name of the store the events belong to. */
  store: string;
  results: EventResult[];
}

/** The helper's stdout payload on an invocation-level failure: nothing was written. */
export interface UpdateFailure {
  ok: false;
  error: UpdateErrorCode;
  message: string;
}

/** Categorical invocation-level error codes the helper can return without an unexpected throw. */
export type UpdateErrorCode =
  'invalid-args' | 'missing-store' | 'store-not-registered' | 'readonly-store' | 'no-default-store';

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type UpdateResult = UpdateBatchSuccess | UpdateFailure;

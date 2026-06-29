// Shapes for the kb-update-events helper: parsed CLI input and the JSON result emitted to stdout.
//
// The helper's stdout payload is a discriminated union on `ok`. An invocation-level failure (invalid args, or a store
// that cannot be resolved or is readonly) returns `{ ok: false, error, message }` and writes nothing. Otherwise the
// batch returns `{ ok: true, ..., results }`, where each event carries its own success or failed-with-reason entry.
// System errors (out-of-disk, permission denied) are out of band: they print to stderr and exit non-zero.

/** Operation names — one per mutually-exclusive op flag. */
export type OperationName = 'add-addressed-by' | 'retag';

/**
 * Parsed command-line invocation. A discriminated union on `operation`. `store` is `null` when `--store` was omitted,
 * which the resolver refuses with `missing-store`; `ids` is the list of event ids the operation applies to.
 */
export type ParsedArgs =
  | { operation: 'add-addressed-by'; store: string | null; ids: string[]; references: string[] }
  | { operation: 'retag'; store: string | null; ids: string[]; tags: string[] };

/** Per-event outcome, in the order the ids were supplied. */
export type EventResult =
  { ok: true; id: string; path: string } | { ok: false; id: string; error: EventErrorCode; message: string };

/** Categorical per-event error codes. */
export type EventErrorCode = 'invalid-id' | 'not-found' | 'parse' | 'validation';

/** The helper's stdout payload when the batch ran: per-event results carry individual success or failure. */
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

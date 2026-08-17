// Shapes for the select-lede-exemplars helper: the exemplars it emits, how far it reached to find them, and the
// stdout payload carrying both.
//
// The payload is a discriminated union on `ok`, mirroring the sibling helpers. An exhausted corpus is a success
// carrying a diagnostic rather than a failure: a drafter degrades to no exemplars, and is never blocked by their
// absence.

/** One author-approved lede, with the change identity a drafter calibrates a new lede against. */
export interface LedeExemplar {
  /** The approved text: the record's merged lede when it carries one, its agent lede otherwise. */
  lede: string;
  /** Canonical work-type key, so a record filed under an alias and one filed under the key read alike. */
  type: string;
  tier: string;
  scope: string;
  /** Number of the pull request the lede shipped with. */
  pr: string;
  capturedAt: string;
}

/**
 * How far selection reached past the requested type: `none` drew on that type alone, `tier` also drew on its
 * tier-mates, and `any` also drew on types of other tiers.
 */
export type Widening = 'none' | 'tier' | 'any';

/** The selection core's outcome: the exemplars newest first, the widening that ran, and the records it could not read. */
export interface ExemplarSelection {
  exemplars: LedeExemplar[];
  widening: Widening;
  /** One line per decision record that could not be read as an exemplar; a malformed record never fails the run. */
  warnings: string[];
}

/** Every categorical reason a request fails without an unexpected throw. */
export type SelectErrorCode = 'invalid-args' | 'no-taxonomy' | 'store-not-registered' | 'unknown-type';

/** The stdout payload for a completed selection. */
export interface SelectSuccess {
  ok: true;
  /** Canonical key of the requested work type, whichever spelling the request used. */
  type: string;
  tier: string;
  widening: Widening;
  exemplars: LedeExemplar[];
  /** Registry name of the corpus that was read. */
  store: string;
  warnings: string[];
  /** Set when the corpus yielded no exemplars, so a caller can tell an empty corpus from an empty request. */
  diagnostic?: string;
}

/** The stdout payload on a recoverable failure. */
export interface SelectFailure {
  ok: false;
  error: SelectErrorCode;
  message: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type SelectResult = SelectSuccess | SelectFailure;

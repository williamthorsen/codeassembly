// Shapes for the select-lede-exemplars helper: the exemplars that it emits, how far it reached to find them, and the
// stdout payload that contains both.
//
// The payload is a discriminated union on `ok`. An exhausted corpus is a success with a diagnostic rather than a
// failure: A drafter degrades to no exemplars, and is never blocked by their absence.

import type { LedeQuality } from '../lede-corpus/lede-quality.ts';
import type { WorkType } from '../lib/work-types.ts';

/**
 * What a selection matches on. A caller that resolved the change's work type selects on it; one that could not
 * selects on the tier alone, which is what the dispatched tier already names, so a drafter never has to invent a type
 * to make a request.
 */
export type ExemplarRequest =
  { readonly kind: 'type'; readonly workType: WorkType } | { readonly kind: 'tier'; readonly tier: string };

/** One author-approved lede, with the change identity against which a drafter calibrates a new lede. */
export interface LedeExemplar {
  /** The approved text: the record's merged lede when it has one, its agent lede otherwise. */
  lede: string;
  /** The agent's own lede. Present only when the request asked for the decision pair. */
  agentLede?: string;
  /** The lede that the author merged. Absent when they left the agent's alone, and when no pair was asked for. */
  mergedLede?: string;
  /** The author's critique of the agent's lede. Absent when none was given, and when no pair was asked for. */
  comment?: string;
  /** Canonical work-type key, so that a record filed under an alias and one filed under the key read alike. */
  type: string;
  tier: string;
  /** Scope the change belongs to; absent for a change that names none. */
  scope?: string;
  /** Number of the pull request in which the lede was merged. */
  pr: string;
  capturedAt: string;
}

/**
 * How far selection reached past what was requested: `none` drew on the request's own match alone, `tier` also drew on
 * the requested type's tier-mates, and `any` also drew on other tiers. A tier request matches every type of its tier,
 * so it reports `none` or `any` and never the middle step.
 */
export type Widening = 'none' | 'tier' | 'any';

/**
 * The selection core's outcome: the exemplars newest first, the widening that ran, and the records that it could not
 * read.
 */
export interface ExemplarSelection {
  exemplars: LedeExemplar[];
  widening: Widening;
  /** One line per record that could not be read as an exemplar; a malformed record never fails the run. */
  warnings: string[];
}

/** The stdout payload's report of the floor applied by a request. */
export type AppliedFloor = LedeQuality | 'none';

/** Every categorical reason a request fails without an unexpected throw. */
export type SelectErrorCode = 'invalid-args' | 'no-taxonomy' | 'store-not-registered' | 'unknown-tier' | 'unknown-type';

/** The stdout payload for a completed selection. */
export interface SelectSuccess {
  ok: true;
  /** Canonical key of the requested work type, whichever spelling the request used; absent for a tier request. */
  type?: string;
  tier: string;
  widening: Widening;
  /** The rating floor that the request applied; `none` when it named none and read every record. */
  minQuality: AppliedFloor;
  exemplars: LedeExemplar[];
  /** Registry name of the corpus that was read. */
  store: string;
  warnings: string[];
  /** Set when the corpus yielded no exemplars, so that a caller can tell an empty corpus from an empty request. */
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

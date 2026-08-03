// Shape of the kb-retrieve-events helper's candidate table. The helper performs mechanical recall via the shared
// `kb-search` primitive and projects event records into candidates carrying their recurrence signals; the agent ranks
// by recurrence then recency and presents.

import type { EventImpact } from '@williamthorsen/kb/records';

import type { ScopedKb } from '../kb-search/types.ts';

/** A normalized event candidate ready for the agent to rank by recurrence then recency. */
export interface EventCandidate {
  /** Absolute path to the event note that was matched. */
  path: string;
  /** The event's human-readable `summary`, or the file basename when absent. */
  summary: string;
  /** ISO-8601 capture timestamp (the `captured-at` field); `null` when absent. */
  capturedAt: string | null;
  /** `owner/name` repository the event was captured in; `undefined` when absent. */
  repo?: string;
  /** The number of query-matched events sharing this event's `repo` recurrence group; a coarse recurrence signal. */
  occurrences: number;
  /** Canonical tags from frontmatter. */
  tags: string[];
  /** A context snippet drawn from the ripgrep match. */
  snippet: string;
  /**
   * References to whatever was done about the problem this event notes (its `addressed-by` list): a KB
   * wikilink/relative path, commit SHA, PR/issue ref, or URL. `undefined` when the event declares none.
   */
  addressedBy?: string[];
  /**
   * The author's revisable rating of how much addressing this event matters. `undefined` when the event is unrated or
   * carries a value outside the declared levels. Shown to the reader and usable by `--min-impact`, but not a ranking
   * signal.
   */
  impact?: EventImpact;
  /** Name of the source KB, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** A diagnostic note for this candidate, e.g. malformed frontmatter degraded to a low-signal hit. */
  diagnostic?: string;
}

/** The helper's full stdout payload: the event candidate table plus run-level diagnostics. */
export interface EventRetrieveResult {
  /** The normalized event candidates, one per matched event. */
  candidates: EventCandidate[];
  /** The knowledge bases that were actually searched: in-scope KBs minus any whose path did not exist on disk. */
  scopedKbs: ScopedKb[];
  /** Registry-health problems (malformed registry, dead entry paths), always present and possibly empty. */
  warnings: string[];
  /** A run-level diagnostic, set when scope is empty or no events matched. */
  diagnostic?: string;
}

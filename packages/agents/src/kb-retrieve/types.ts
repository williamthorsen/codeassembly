// Shape of the kb-retrieve helper's candidate table and the inputs the helper modules exchange.
//
// The candidate table is the helper's stable contract with `SKILL.md`: the helper performs mechanical recall (via the
// shared `kb-search` primitive) and emits raw assertion signals (freshness age, tags, supersession), and the agent
// ranks and presents. The shape is deliberately backend-agnostic so a future non-ripgrep recall can populate the same
// structure without changing `SKILL.md`.

import type { ScopedKb } from '../kb-search/types.ts';

/** A fully normalized assertion candidate ready for the agent to rank and present. */
export interface AssertionCandidate {
  /** Absolute path to the note that was matched. */
  path: string;
  /** Note title from frontmatter, or the file basename when frontmatter is missing or malformed. */
  title: string;
  /** The note's Diátaxis facet (the `diataxis` extra field), or `null` when absent. */
  diataxis: string | null;
  /** Canonical tags from frontmatter. */
  tags: string[];
  /** A context snippet drawn from the ripgrep match. */
  snippet: string;
  /** Whole days between the note's `last-verified` date and now, or `null` when the field is absent. */
  lastVerifiedAgeDays: number | null;
  /** Supersession status, following the `superseded-by` chain to the canonical successor. */
  supersession: Supersession;
  /**
   * References to whatever was done about the problem this record notes (its `addressed-by` list): a KB
   * wikilink/relative path, commit SHA, PR/issue ref, or URL. `undefined` when the record declares none.
   */
  addressedBy?: string[];
  /** Name of the source KB, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** A diagnostic note for this candidate, e.g. malformed frontmatter or a missing recordType degraded to a low-signal hit. */
  diagnostic?: string;
}

/** The helper's full stdout payload: the candidate table plus run-level diagnostics. */
export interface RetrieveResult {
  /** The normalized assertion candidates, one per matched note. */
  candidates: AssertionCandidate[];
  /** The knowledge bases that were actually searched: in-scope KBs minus any whose path did not exist on disk. */
  scopedKbs: ScopedKb[];
  /** Registry-health problems (malformed registry, dead entry paths), always present and possibly empty. */
  warnings: string[];
  /** A run-level diagnostic, set when scope is empty or no notes matched. */
  diagnostic?: string;
}

/** A note's supersession status, surfaced as a raw signal for the agent to route on. */
export interface Supersession {
  /** Whether the originally matched note declares `superseded-by`. */
  superseded: boolean;
  /** Absolute path of the canonical successor note, when the chain resolved. `null` otherwise. */
  canonicalPath: string | null;
  /** Set when a `superseded-by` cycle or unresolvable hop was detected. */
  diagnostic?: string;
}

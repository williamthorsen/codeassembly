// The candidate table is the helper's contract with `SKILL.md`, so the shape and the skill change together.

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
  /** Whole days between the note's `last-verified` date and now, or `null` when no age could be computed. */
  lastVerifiedAgeDays: number | null;
  /** Supersession status, following the `superseded-by` chain to the canonical successor. */
  supersession: Supersession;
  /**
   * References to whatever was done about the problem that this record notes (its `addressed-by` list): a KB
   * wikilink/relative path, commit SHA, PR/issue ref, or URL.
   */
  addressedBy?: string[];
  /** Name of the source KB, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** Why this candidate degraded to a low-signal hit. */
  diagnostic?: string;
}

/** The helper's full stdout payload: the candidate table plus run-level diagnostics. */
export interface RetrieveResult {
  /** The normalized assertion candidates, one per matched note. */
  candidates: AssertionCandidate[];
  /** The knowledge bases that the search covered. */
  scopedKbs: ScopedKb[];
  /** Knowledge-base health problems, always present and possibly empty. */
  warnings: string[];
  /** A run-level diagnostic, set when the run produced no candidates. */
  diagnostic?: string;
}

/** A note's supersession status, surfaced as a raw signal for the agent to route on. */
export interface Supersession {
  /** Whether the originally matched note declares `superseded-by`. */
  superseded: boolean;
  /** Absolute path of the canonical successor note, when the chain resolved. `null` otherwise. */
  canonicalPath: string | null;
  /** Set when a defect ended the walk early. */
  diagnostic?: string;
}

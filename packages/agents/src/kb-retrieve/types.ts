// Shape of the kb-retrieve helper's candidate table and the inputs the helper modules exchange.
//
// The candidate table is the helper's stable contract with `SKILL.md`: the helper performs mechanical recall and emits
// raw signals (freshness age, tags, supersession), and the agent ranks and presents. The shape is deliberately
// backend-agnostic so a future non-ripgrep recall can populate the same structure without changing `SKILL.md`.

/** A fully normalized candidate note ready for the agent to rank and present. */
export interface Candidate {
  /** Absolute path to the note that was matched. */
  path: string;
  /** Note title from frontmatter, or the file basename when frontmatter is missing or malformed. */
  title: string;
  /** Note `type` from frontmatter, or `null` when missing or malformed. */
  type: string | null;
  /** Canonical tags from frontmatter. */
  tags: string[];
  /** A context snippet drawn from the ripgrep match. */
  snippet: string;
  /** Whole days between the note's `last-verified` date and now, or `null` when the field is absent. */
  lastVerifiedAgeDays: number | null;
  /** Supersession status, following the `superseded-by` chain to the canonical successor. */
  supersession: Supersession;
  /** Name of the source KB, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** A diagnostic note for this candidate, e.g. malformed frontmatter degraded to a low-signal hit. */
  diagnostic?: string;
}

/** A single ripgrep hit before frontmatter parsing and normalization. */
export interface RawHit {
  /** Absolute path to the matched note file. */
  path: string;
  /** Name of the KB the note belongs to, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** Absolute path to the KB root the note belongs to. */
  kbPath: string;
  /** A context snippet drawn from the matching line and its neighbors. */
  snippet: string;
}

/** The mechanical filters applied to the candidate set, parsed from `--type`, `--tag`, `--folder`. */
export interface RecallFilters {
  /** Restrict to notes whose frontmatter `type` matches, case-insensitively. */
  type?: string;
  /** Restrict to notes carrying this tag (canonical or alias), case-insensitively. */
  tag?: string;
  /** Restrict to notes whose path contains this folder segment, case-insensitively. */
  folder?: string;
}

/** The helper's full stdout payload: the candidate table plus run-level diagnostics. */
export interface RetrieveResult {
  /** The normalized candidates, one per matched note. */
  candidates: Candidate[];
  /** The knowledge bases that were actually searched: in-scope KBs minus any whose path did not exist on disk. */
  scopedKbs: ScopedKb[];
  /** Registry-health problems (malformed registry, dead entry paths), always present and possibly empty. */
  warnings: string[];
  /** A run-level diagnostic, set when scope is empty or no notes matched. */
  diagnostic?: string;
}

/** A knowledge base resolved as in-scope for the current query. */
export interface ScopedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** How the KB entered scope. */
  via: 'discovery' | 'registry-default' | 'registry-all';
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

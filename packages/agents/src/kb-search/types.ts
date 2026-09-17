// Shapes for the shared, type-blind note search primitive.

import type { ParsedNote } from '@williamthorsen/kb/frontmatter';

/** A single ripgrep hit before frontmatter parsing and normalization. */
export interface RawHit {
  /** Absolute path to the matched note file. */
  path: string;
  /** Name of the KB to which the note belongs, or `null` for a registry-less discovered KB. */
  kbName: string | null;
  /** Absolute path to the KB root to which the note belongs. */
  kbPath: string;
  /** A context snippet drawn from the matching line and its neighbors. */
  snippet: string;
}

/** The mechanical filters applied to recalled hits, each parsed from the flag of the same name. */
export interface RecallFilters {
  /** Restricts to notes whose Diátaxis facet (the `diataxis` extra field) matches, case-insensitively. */
  diataxis?: string;
  /** Restricts to notes that have this tag (canonical or alias), case-insensitively. */
  tag?: string;
  /** Restricts to notes whose path contains this folder segment, case-insensitively. */
  folder?: string;
}

/** A knowledge base resolved as in-scope for the current query. */
export interface ScopedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** How the KB was added to scope. */
  via: 'discovery' | 'registry-default' | 'registry-all' | 'registry-named';
}

/** A recalled note that passed note-set scoping and the mechanical filters. */
export interface SearchHit {
  hit: RawHit;
  /** The parsed note; its `frontmatter` is `null` when the block is missing or malformed. */
  note: ParsedNote;
}

export interface SearchResult {
  hits: SearchHit[];
  /** The knowledge bases actually searched: in-scope KBs minus any whose path did not exist on disk. */
  scopedKbs: ScopedKb[];
  /** Operator-facing health problems, in deterministic order; always present, possibly empty. */
  warnings: string[];
  /** Note-set-scoped hits before the mechanical filters ran, so that a command can tell "nothing matched" from "all filtered out". */
  recalledCount: number;
  /** Set only when the resolved scope is empty; the command reports it as the run diagnostic. */
  emptyScopeDiagnostic?: string;
}

// Shapes for the shared, type-blind note search primitive: the raw recall hit, the resolved search hit handed to each
// command's projection, and the run-level envelope. The primitive performs scope resolution, ripgrep recall, note-set
// scoping, schema loading, parsing, and the mechanical filters; the assertion and event retrieve commands each project
// these hits into their own candidate shape.

import type { ParsedNote } from '@codeassembly/kb/frontmatter';

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

/** The mechanical filters applied to recalled hits, parsed from `--diataxis`, `--tag`, `--folder`. */
export interface RecallFilters {
  /** Restrict to notes whose Diátaxis facet (the `diataxis` extra field) matches, case-insensitively. */
  diataxis?: string;
  /** Restrict to notes carrying this tag (canonical or alias), case-insensitively. */
  tag?: string;
  /** Restrict to notes whose path contains this folder segment, case-insensitively. */
  folder?: string;
}

/** A knowledge base resolved as in-scope for the current query. */
export interface ScopedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** How the KB entered scope. */
  via: 'discovery' | 'registry-default' | 'registry-all' | 'registry-named';
}

/**
 * A recalled note that survived note-set scoping and the mechanical filters, parsed and ready for a command to project
 * into its own candidate shape.
 */
export interface SearchHit {
  /** The raw recall hit: note path, source KB, and the ripgrep snippet. */
  hit: RawHit;
  /** The parsed note; its `frontmatter` is `null` when the block is missing or malformed. */
  note: ParsedNote;
  /** The recall policy resolved from the note's record type in its KB's schema (e.g. `freshness`), driving ranking. */
  recall: string;
}

/** The shared search primitive's output: parsed hits plus the run-level signals each command composes its result from. */
export interface SearchResult {
  /** Hits surviving note-set scoping and the mechanical filters, each parsed and carrying its recall policy. */
  hits: SearchHit[];
  /** The knowledge bases actually searched: in-scope KBs minus any whose path did not exist on disk. */
  scopedKbs: ScopedKb[];
  /** Registry/config/schema-health and unreadable-note problems, in deterministic order; always present, possibly empty. */
  warnings: string[];
  /** Note-set-scoped hits before the mechanical filters ran, so a command can tell "nothing matched" from "all filtered out". */
  recalledCount: number;
  /** Set only when scope was empty (no KB, an unknown store, or a malformed registry); the command surfaces it as the run diagnostic. */
  emptyScopeDiagnostic?: string;
}

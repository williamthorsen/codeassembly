// Shared type vocabulary for @codeassembly/kb.
//
// This file is the documented exception to the "types live with their provider" convention:
// The modules below all consume the same shapes, so co-locating them keeps the contract single-sourced.
// It is types-only and produces no runtime emissions.

/** A discovered knowledge-base root and how it was found. */
export interface KbRoot {
  /** Absolute path to the directory containing the `.kb/` folder. */
  path: string;
  /** Absolute path to the `.kb/` directory itself. */
  kbDir: string;
  /** How the root was located. */
  via: 'ancestor-walk';
}

/** A single knowledge base declared in a `kb.yaml` registry, normalized in memory. */
export interface KbRegistryEntry {
  /** The KB's name, lifted from the `kbs` map key. */
  name: string;
  /** Absolute path to the KB's root directory (tilde expanded, relative resolved). */
  path: string;
  /** Optional human-readable description. */
  description?: string;
  /** Whether this is the default KB. */
  default?: boolean;
  /** Whether the KB is read-only. */
  readonly?: boolean;
  /** Which registry the entry came from. */
  source: 'user' | 'project';
}

/** The merged, normalized KB registry. */
export interface KbRegistry {
  /** All KB entries, user entries merged with project overrides. */
  entries: KbRegistryEntry[];
  /** Absolute paths of the registry files that contributed entries. */
  sources: {
    user?: string;
    project?: string;
  };
}

/**
 * A note-type-and-field schema for a knowledge base.
 *
 * The flat `types`/`required`/`optional` fields are always populated and describe the union of the store's vocabulary,
 * keeping legacy consumers working unchanged. A kind-aware store additionally carries `kinds`: when present, per-type
 * required-field validation and per-kind recall policy are driven by it, and the flat fields are derived as the union
 * across every declared kind and type.
 */
export interface Schema {
  /** Allowed `type` field values. */
  types: readonly string[];
  /** Field names that every note must declare. */
  required: readonly string[];
  /** Field names a note may optionally declare. */
  optional: readonly string[];
  /** Per-kind, per-type vocabulary; present only for kind-aware stores (a `.kb/schema.yaml` that declares `kinds:`). */
  kinds?: KindsSchema;
}

/** The kind-aware vocabulary of a store, keyed by kind name (e.g. `event`, `assertion`). */
export type KindsSchema = Readonly<Record<string, KindSchema>>;

/** A single kind's shared vocabulary, recall policy, immutability, and its constituent types. */
export interface KindSchema {
  /** Field names required by every type of this kind (the shared spine). */
  required: readonly string[];
  /** Field names any type of this kind may optionally declare. */
  optional: readonly string[];
  /** How recall ranks records of this kind, e.g. `freshness` or `recurrence-recency`. */
  recall: string;
  /** When true, records of this kind are write-once and carry no `updated`/`last-verified` fields. */
  immutable: boolean;
  /** The kind's constituent types, each declaring any required fields it adds on top of the kind's shared set. */
  types: Readonly<Record<string, TypeSchema>>;
}

/** A single type's contribution to its kind: the required fields it adds on top of the kind's shared spine. */
export interface TypeSchema {
  /** Field names this type requires beyond its kind's shared `required` set. */
  required: readonly string[];
}

/** Strongly-typed frontmatter for a note. */
export interface Frontmatter {
  title: string;
  type: string;
  /** UTC `YYYY-MM-DD`. */
  created: string;
  /** UTC `YYYY-MM-DD`. */
  updated: string;
  tags: string[];
  /** Optional and unknown fields, preserved through round-trip in insertion order. */
  extra: Record<string, unknown>;
}

/** The raw frontmatter slice plus parse diagnostics, kept so rules can report at source line numbers. */
export interface FrontmatterRaw {
  /** The YAML text between the opening and closing `---` fences. */
  text: string;
  /** 1-based line of the opening `---` fence. */
  startLine: number;
  /** 1-based line of the closing `---` fence. */
  endLine: number;
  /** YAML parse error message, if the block could not be parsed. */
  parseError?: string;
}

/** A note parsed into frontmatter and body. */
export interface ParsedNote {
  /** Path or label the note was parsed from. */
  path: string;
  /** The full original note content. */
  content: string;
  /** Typed frontmatter, or `null` when no frontmatter block is present or it failed to parse. */
  frontmatter: Frontmatter | null;
  /** Raw frontmatter slice and diagnostics, or `null` when no `---` block is present. */
  frontmatterRaw: FrontmatterRaw | null;
  /** The note body (everything after the closing `---`). */
  body: string;
  /** 1-based line where the body begins. */
  bodyStartLine: number;
}

/** Severity of a validation finding. */
export type FindingSeverity = 'error' | 'warning';

/** A single validation finding produced by a rule. */
export interface Finding {
  /** Path or label of the note the finding applies to. */
  path: string;
  /** 1-based source line number, when known. */
  line?: number;
  /** Rule code, e.g. `frontmatter.required`. */
  rule: string;
  severity: FindingSeverity;
  message: string;
}

/** A lowercase-keyed map from tag alias to its canonical form. */
export type AliasMap = ReadonlyMap<string, string>;

/**
 * A vault-wide lookup from a note basename (without the `.md` extension) to the set of note paths that share it.
 * A single-path entry resolves a wikilink unambiguously; a multi-path entry is ambiguous. Consumed by cross-note
 * rules (e.g. `wikilinks`) that need context beyond the single note under validation.
 */
export type VaultIndex = ReadonlyMap<string, ReadonlySet<string>>;

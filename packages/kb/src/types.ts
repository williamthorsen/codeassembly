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
  /** Whether the KB is read-only. */
  readonly?: boolean;
  /** Which registry the entry came from. */
  source: 'user' | 'project';
}

/** The merged, normalized KB registry. */
export interface KbRegistry {
  /** All KB entries, user entries merged with project overrides. */
  entries: KbRegistryEntry[];
  /** The entry named by `default_kb`, resolved against `entries`; absent when `default_kb` is unset. */
  defaultKb?: KbRegistryEntry;
  /** Absolute paths of the registry files that contributed entries. */
  sources: {
    user?: string;
    project?: string;
  };
}

/** Strongly-typed frontmatter for a note. */
export interface Frontmatter {
  title: string;
  /** The stored record-type discriminant (e.g. `assertion`, `event`). */
  recordType: string;
  /** Second-precision UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`); bare legacy `YYYY-MM-DD` dates remain valid. */
  created: string;
  /** Second-precision UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`); bare legacy `YYYY-MM-DD` dates remain valid. */
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

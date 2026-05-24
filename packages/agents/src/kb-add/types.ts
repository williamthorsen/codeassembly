// Shapes for the kb-add helper: parsed CLI input, the resolved write target, and the JSON result emitted to stdout.
//
// The helper's stdout payload is a discriminated union on `ok`. Recoverable failures (collision, schema validation,
// no resolvable KB, invalid title) return `{ ok: false, error, details? }`; successes return `{ ok: true, ... }`.
// System errors (out-of-disk, permission denied) are out of band: They print to stderr and exit non-zero.

import type { Finding, Frontmatter } from '@codeassembly/kb-core';

/** Parsed command-line invocation of the kb-add helper. */
export interface ParsedArgs {
  /** Optional explicit KB name; when set, wins over discovery and registry-default. */
  kb: string | null;
  /** Optional KB-relative folder under which the note is written; defaults to the KB root. */
  folder: string | null;
  /** The note's `type` field (e.g. `howto`). */
  type: string;
  /** The note title; also doubles as the filename stem. */
  title: string;
  /** The proposed tag list, in the order the agent supplied them. */
  tags: string[];
  /** Optional `last-verified` date (`YYYY-MM-DD`). */
  lastVerified: string | null;
}

/** A knowledge base resolved as the write target. */
export interface ResolvedKb {
  /** The KB's display name. `null` for a `.kb/`-discovered KB with no registry entry. */
  name: string | null;
  /** Absolute path to the KB's root directory. */
  path: string;
  /** Which selection rule fired. */
  source: 'explicit' | 'discovered' | 'registry-default';
}

/** The prepared note ready to be written: the rendered frontmatter, the body, and the canonicalization audit trail. */
export interface PreparedNote {
  /** Frontmatter with canonical tags, UTC dates filled in, and the optional `last-verified` field merged into `extra`. */
  frontmatter: Frontmatter;
  /** Tag list as the agent supplied it, before alias canonicalization. */
  originalTags: string[];
  /** Tag list as written to disk, after alias canonicalization. */
  canonicalTags: string[];
}

/** The helper's stdout payload on success. */
export interface AddSuccess {
  ok: true;
  /** Absolute path of the written note. */
  path: string;
  /** The KB the note was written to. */
  kb: ResolvedKb;
  /** The frontmatter that was written, post-canonicalization. */
  frontmatter: Frontmatter;
  /** Tag list as the agent supplied it, before alias canonicalization. */
  originalTags: string[];
  /** Tag list as written to disk, after alias canonicalization. */
  canonicalTags: string[];
}

/** The helper's stdout payload on a recoverable failure. */
export interface AddFailure {
  ok: false;
  /** Categorical error code. */
  error: AddErrorCode;
  /** Short human-readable explanation. */
  message: string;
  /** Optional per-error details. */
  details?: AddErrorDetails;
}

/** Categorical error codes the helper can return without an unexpected throw. */
export type AddErrorCode = 'no-kb-resolvable' | 'invalid-args' | 'invalid-title' | 'schema-validation' | 'collision';

/** Per-error structured details. */
export interface AddErrorDetails {
  /** Path of the existing file, set when `error: 'collision'`. */
  existingPath?: string;
  /** Findings, set when `error: 'schema-validation'`. */
  findings?: Finding[];
  /** Name of the explicit KB that did not resolve, set when `error: 'no-kb-resolvable'` after `--kb` was supplied. */
  requestedKb?: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type AddResult = AddSuccess | AddFailure;

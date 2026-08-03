// Shapes for the kb-add helper: parsed CLI input, the resolved write target, and the JSON result emitted to stdout.
//
// The helper's stdout payload is a discriminated union on `ok`. Recoverable failures (collision, no resolvable KB,
// invalid title) return `{ ok: false, error, details? }`; successes return `{ ok: true, ... }`. System errors
// (out-of-disk, permission denied) are out of band: They print to stderr and exit non-zero.

import type { KbAssertion } from '@williamthorsen/kb/records';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

/** Parsed command-line invocation of the kb-add helper. */
export interface ParsedArgs {
  /** Optional explicit KB name; when set, wins over discovery and registry-default. */
  kb: string | null;
  /** Optional topic subpath beneath the assertions root (`content/assertions/`) under which the note is written; the
   * archetype segment is owned by the tool, not named here. Defaults to `content/assertions/` itself. */
  folder: string | null;
  /** Optional Diátaxis label (e.g. `howto`); written to the note's extra fields, not a top-level field. */
  diataxis: string | null;
  /** The note title; also doubles as the filename stem. */
  title: string;
  /** The proposed tag list, in the order the agent supplied them. */
  tags: string[];
}

/** The prepared note ready to be written: the assertion record and the canonicalization audit trail. */
export interface PreparedNote {
  /** The born-verified assertion record: `created`, `updated`, and `lastVerified` stamped from one instant. */
  record: KbAssertion;
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
  /** The assertion record that was written, post-canonicalization. */
  record: KbAssertion;
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
export type AddErrorCode =
  | 'no-kb-resolvable'
  | 'missing-destination'
  | 'no-default'
  | 'invalid-args'
  | 'invalid-title'
  | 'collision'
  | 'readonly-kb';

/** Per-error structured details. */
export interface AddErrorDetails {
  /** Path of the existing file, set when `error: 'collision'`. */
  existingPath?: string;
  /** Name of the explicit KB that did not resolve, set when `error: 'no-kb-resolvable'` after `--kb` was supplied. */
  requestedKb?: string;
  /** Registry name of the readonly KB that refused the write, set when `error: 'readonly-kb'`. */
  readonlyKbName?: string;
  /** Absolute path of the readonly KB that refused the write, set when `error: 'readonly-kb'`. */
  readonlyKbPath?: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type AddResult = AddSuccess | AddFailure;

// Re-export so existing kb-add consumers don't need to learn the kb-shared path.
export type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

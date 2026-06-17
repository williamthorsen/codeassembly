// Shapes for the kb-edit helper: parsed CLI input and the JSON result emitted to stdout.
//
// The helper's stdout payload is a discriminated union on `ok`. Recoverable failures (collision-adjacent issues such
// as `note-not-found`, schema validation, readonly KB, supersede-target-missing, and partial-supersede) return
// `{ ok: false, error, details? }`; successes return `{ ok: true, ... }`. System errors (out-of-disk, permission
// denied) are out of band: they print to stderr and exit non-zero.

import type { Finding, Frontmatter } from '@codeassembly/kb';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

/** Operation names — one per mutually-exclusive op flag. */
export type OperationName = 'bump-updated' | 'verify' | 'retag' | 'append' | 'add-addressed-by' | 'supersede-with';

/**
 * Parsed command-line invocation of the kb-edit helper.
 *
 * A discriminated union on `operation` so each operation module receives only its own typed inputs. `add-addressed-by`
 * is the one multi-target operation: it carries a list of target `paths` rather than a single `path`.
 */
export type ParsedArgs =
  | { operation: 'bump-updated'; path: string }
  | { operation: 'verify'; path: string }
  | { operation: 'retag'; path: string; tags: string[] }
  | { operation: 'append'; path: string }
  | { operation: 'add-addressed-by'; paths: string[]; references: string[] }
  | { operation: 'supersede-with'; path: string; newPath: string };

/** The helper's stdout payload on success for a single-file operation. */
export interface EditSingleSuccess {
  ok: true;
  operation: Exclude<OperationName, 'add-addressed-by' | 'supersede-with'>;
  /** Absolute path of the edited note. */
  path: string;
  /** The KB the note belongs to. */
  kb: ResolvedKb;
  /** The frontmatter that was written, post-canonicalization. */
  frontmatter: Frontmatter;
  /** Tag list as the agent supplied it before canonicalization. Set only for `retag`. */
  originalTags?: string[];
  /** Tag list as written to disk, after canonicalization. Set only for `retag`. */
  canonicalTags?: string[];
}

/** The helper's stdout payload on a successful `supersede-with`. */
export interface EditSupersedeSuccess {
  ok: true;
  operation: 'supersede-with';
  /** Absolute path of the old note (now marked superseded). */
  oldPath: string;
  /** Absolute path of the new (superseding) note. */
  newPath: string;
  /** The KB both notes belong to. */
  kb: ResolvedKb;
  /** Frontmatter written to the old note, including `superseded-by` and the `deprecated` tag. */
  oldFrontmatter: Frontmatter;
  /** Frontmatter written to the new note, including `supersedes`. */
  newFrontmatter: Frontmatter;
}

/** Per-record outcome for the multi-target `add-addressed-by` operation. */
export type AddAddressedByResult =
  | { ok: true; path: string; kb: ResolvedKb; frontmatter: Frontmatter }
  | { ok: false; path: string; error: EditErrorCode; message: string; details?: EditErrorDetails };

/**
 * The helper's stdout payload for the multi-target `add-addressed-by` operation. `ok: true` signals the batch ran
 * without a usage or system error; per-record success or failure is carried in `results`, in the order the target
 * paths were supplied.
 */
export interface EditBatchSuccess {
  ok: true;
  operation: 'add-addressed-by';
  results: AddAddressedByResult[];
}

/** Discriminated success union. */
export type EditSuccess = EditSingleSuccess | EditSupersedeSuccess | EditBatchSuccess;

/** The helper's stdout payload on a recoverable failure. */
export interface EditFailure {
  ok: false;
  /** Categorical error code. */
  error: EditErrorCode;
  /** Short human-readable explanation. */
  message: string;
  /** Optional per-error details. */
  details?: EditErrorDetails;
}

/** Categorical error codes the helper can return without an unexpected throw. */
export type EditErrorCode =
  | 'invalid-args'
  | 'no-kb-resolvable'
  | 'note-not-found'
  | 'note-parse'
  | 'schema-validation'
  | 'readonly-kb'
  | 'supersede-target-missing'
  | 'partial-supersede';

/** Per-error structured details. */
export interface EditErrorDetails {
  /** Path that failed to resolve, set when `error: 'note-not-found'` or `'supersede-target-missing'`. */
  missingPath?: string;
  /** YAML parse error message, set when `error: 'note-parse'`. */
  parseError?: string;
  /** Findings, set when `error: 'schema-validation'`. */
  findings?: Finding[];
  /** Registry name of the readonly KB that refused the write, set when `error: 'readonly-kb'`. */
  readonlyKbName?: string;
  /** Absolute path of the readonly KB that refused the write, set when `error: 'readonly-kb'`. */
  readonlyKbPath?: string;
  /** Old-note path, set when `error: 'partial-supersede'`. */
  oldPath?: string;
  /** New-note path, set when `error: 'partial-supersede'`. */
  newPath?: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type EditResult = EditSuccess | EditFailure;

// Re-export so kb-edit consumers don't need to learn the kb-shared path.
export type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

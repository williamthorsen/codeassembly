// Shapes for the kb-edit helper: parsed CLI input and the JSON result emitted to stdout.
//
// A recoverable failure returns `{ ok: false, error, details? }` on stdout. A system error (out of disk, permission
// denied) is out of band: the helper prints it to stderr and exits non-zero.

import type { KbAssertion } from '@williamthorsen/kb/records';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

export type OperationName = 'bump-updated' | 'verify' | 'retag' | 'append' | 'add-addressed-by' | 'supersede-with';

/**
 * Parsed command-line invocation of the kb-edit helper, discriminated on `operation` so that each operation module
 * receives only its own typed inputs.
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
  /** The assertion record that was written, post-canonicalization. */
  record: KbAssertion;
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
  /** The old note's record as written, including `supersededBy` and the `deprecated` tag. */
  oldRecord: KbAssertion;
  /** The new note's record as written, including `supersedes`. */
  newRecord: KbAssertion;
}

/** Per-record outcome for the multi-target `add-addressed-by` operation. */
export type AddAddressedByResult =
  | { ok: true; path: string; kb: ResolvedKb; record: KbAssertion }
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

export type EditSuccess = EditSingleSuccess | EditSupersedeSuccess | EditBatchSuccess;

/** The helper's stdout payload on a recoverable failure. */
export interface EditFailure {
  ok: false;
  error: EditErrorCode;
  /** Short human-readable explanation. */
  message: string;
  details?: EditErrorDetails;
}

/** Categorical error codes the helper can return without an unexpected throw. */
export type EditErrorCode =
  | 'invalid-args'
  | 'no-kb-resolvable'
  | 'note-not-found'
  | 'note-parse'
  | 'validation'
  | 'readonly-kb'
  | 'supersede-target-missing'
  | 'partial-supersede';

export interface EditErrorDetails {
  /** Path that failed to resolve, set when `error: 'note-not-found'` or `'supersede-target-missing'`. */
  missingPath?: string;
  /** YAML or contract parse error message, set when `error: 'note-parse'`. */
  parseError?: string;
  /** Re-parse errors, set when `error: 'validation'`. */
  errors?: string[];
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

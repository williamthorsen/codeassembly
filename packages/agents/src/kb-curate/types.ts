// Shapes for the kb-curate helper: parsed CLI input and the JSON result emitted to stdout.

import type { Finding } from '@williamthorsen/kb';

import type { ResolvedKb } from '../kb-shared/resolve-writable-kb.ts';

/** The run mode: a read-only report, or a report plus the curated safe fixes. */
export type CurateMode = 'report' | 'apply';

/** Parsed command-line invocation of the kb-curate helper. */
export interface ParsedArgs {
  /** Explicit KB name from `--kb`, or `null` to fall back to discovery/registry default. */
  kb: string | null;
  apply: boolean;
  /** Staleness threshold in whole days; defaults to 90. */
  staleAfterDays: number;
}

/** A per-finding remediation outcome produced under `--apply`. */
export interface AppliedFix {
  /** Absolute path of the note targeted by the fix. */
  path: string;
  /** The rule code whose finding the fix addresses. */
  rule: string;
  ok: boolean;
  /** The operation invoked, e.g. `kb-edit --retag` or `rewrite-wikilink`. */
  operation: string;
  /** A short human-readable explanation, present on failure or to describe the change made. */
  message?: string;
}

/** Counts summarizing a finding set, partitioned by severity. */
export interface CurateSummary {
  /** Total findings reported. */
  total: number;
  /** Findings with `severity: 'error'`. */
  errors: number;
  /** Findings with `severity: 'warning'`. */
  warnings: number;
}

/** The helper's stdout payload on success. */
export interface CurateSuccess {
  ok: true;
  mode: CurateMode;
  /** The KB that was curated. */
  kb: ResolvedKb;
  /** All findings, sorted by path, then line, then rule. Under `--apply`, these are the residual findings. */
  findings: Finding[];
  /** Severity-partitioned counts over `findings`. */
  summary: CurateSummary;
  /** Per-finding fix outcomes; present only under `--apply`. */
  applied?: AppliedFix[];
}

/** Categorical error codes that the helper can return without an unexpected throw. */
export type CurateErrorCode = 'invalid-args' | 'invalid-config' | 'no-kb-resolvable' | 'readonly-kb';

/** The helper's stdout payload on a recoverable failure. */
export interface CurateFailure {
  ok: false;
  error: CurateErrorCode;
  /** Short human-readable explanation. */
  message: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type CurateResult = CurateSuccess | CurateFailure;

// Shapes for the revise-object-relatives helper: the prose extracted, the candidates detected, and the JSON payload
// written to stdout.
//
// The helper reports; it never writes. Repair selection is judgment, so the payload carries everything an adjudicator
// needs to decide without reading the file: the sentence, the matched phrase, and the shape that ranks the cost.

/** One over-inclusive site: a head noun whose relative clause may be missing its relativizer. */
export interface Candidate {
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** 1-indexed line the sentence begins on. */
  line: number;
  /** The embedded subject's form, which ranks the construction's cost and points at the likeliest repair. */
  shape: SubjectShape;
  /** The head noun the gap belongs to. */
  head: string;
  /** The embedded subject, as matched. */
  subject: string;
  /** The finite verb the reading turns on. */
  verb: string;
  /** The head noun through the verb: the span rewritten by a repair. */
  phrase: string;
  /** The whole sentence containing the phrase, so adjudication needs no file read. */
  sentence: string;
}

/** Why a prose-bearing file was held out of the sweep. */
export type SkipReason = 'generated' | 'machine-generated' | 'unreadable';

/** How a file's prose is delimited, which decides how the extractor reads it. */
export type ProseKind = 'markdown' | 'script' | 'shell';

/**
 * A block of prose lifted out of a file: a Markdown paragraph, a comment, a string literal, or a table cell.
 *
 * `text` preserves the source's own newlines, so the line holding any offset within it is `line` plus the newlines
 * preceding that offset. Every transformation applied by the extractor is line-preserving for that reason.
 */
export interface ProseSpan {
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** 1-indexed line the block begins on. */
  line: number;
  /** The prose, stripped of the syntax that delimited it. */
  text: string;
}

/** The embedded subject's form, in the order the rulebook ranks it: worst first. */
export type SubjectShape = 'quantified' | 'definite' | 'bare' | 'pronoun';

/** Parsed command-line invocation of the revise-object-relatives helper. */
export interface ParsedArgs {
  /** Paths narrowing the sweep; empty sweeps the whole repository. */
  paths: readonly string[];
}

/** How many candidates a file contributes, so a large sweep can be narrowed before adjudication is paid for. */
export interface FileCount {
  file: string;
  count: number;
}

/** Counts over a candidate set, by file and by shape. */
export interface CandidateSummary {
  /** Total candidates reported. */
  total: number;
  /** Files whose prose the sweep read. */
  filesScanned: number;
  /** Prose-bearing files held out of the sweep, by the reason each was held out. */
  filesSkipped: Readonly<Record<SkipReason, number>>;
  /** Per-file counts, descending by count and then by path. */
  byFile: readonly FileCount[];
  /** Per-shape counts, keyed by every shape so an absent shape reads as zero. */
  byShape: Readonly<Record<SubjectShape, number>>;
}

/** The helper's stdout payload on success. */
export interface DetectSuccess {
  ok: true;
  /** Repository root the sweep ran against. */
  root: string;
  candidates: readonly Candidate[];
  summary: CandidateSummary;
}

/** Categorical error codes the helper returns without an unexpected throw. */
export type DetectErrorCode = 'invalid-args' | 'not-a-repository';

/** The helper's stdout payload on a recoverable failure. */
export interface DetectFailure {
  ok: false;
  error: DetectErrorCode;
  message: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type DetectResult = DetectSuccess | DetectFailure;

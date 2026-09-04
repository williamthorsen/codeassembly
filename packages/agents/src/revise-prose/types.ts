// Shapes for the revise-prose helper: the prose extracted, the candidates detected, and the JSON payload
// written to stdout.
//
// The helper reports; it never writes. Repair selection is judgment, so the payload carries everything an adjudicator
// needs to decide without reading the file: the sentence, the matched phrase, and the shape that ranks the cost.

/** A detected site, discriminated on the rule whose detector reported it. */
export type Candidate = EmDashCandidate | ObjectRelativeCandidate;

/** What every candidate carries, whichever rule found it. */
export interface CandidateBase {
  /** The rule whose detector reported the site. */
  rule: RuleId;
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** 1-indexed line on which the sentence begins. */
  line: number;
  /**
   * The span a repair rewrites. Distinctive within its file, which is what lets a recorded rejection resolve to one
   * site without a line number that the next edit invalidates.
   */
  phrase: string;
  /** The whole sentence containing the phrase, so adjudication needs no file read. */
  sentence: string;
  /** Present where a rejection recorded at an older unit version matched, which re-opens it for review. */
  stale?: boolean;
}

/** One em-dash site. Its phrase is the whole sentence, a character being nothing a rejection could resolve against. */
export interface EmDashCandidate extends CandidateBase {
  rule: 'em-dash';
}

/**
 * One over-inclusive site: a head noun whose relative clause may be missing its relativizer. Its phrase runs from the
 * head noun through the verb.
 */
export interface ObjectRelativeCandidate extends CandidateBase {
  rule: 'reduced-object-relative';
  /** The embedded subject's form, which ranks the construction's cost and points at the likeliest repair. */
  shape: SubjectShape;
  /** The head noun to which the gap belongs. */
  head: string;
  /** The embedded subject, as matched. */
  subject: string;
  /** The finite verb on which the reading turns. */
  verb: string;
}

/** A rule the sweep detects. A rule has a detector; a unit, which the record tracks, need not. */
export type RuleId = 'em-dash' | 'reduced-object-relative';

/** One dispatch unit: whole files whose combined bytes fit the budget, in the order the sweep resolved them. */
export interface Batch {
  /** 0-indexed position in the run, the recurring batches leading. */
  index: number;
  /** The files this batch covers. */
  files: readonly string[];
  /** Combined byte length of those files. */
  bytes: number;
  /**
   * Whether this batch holds components of files linked by a shared sentence. The budget binds it like any other,
   * except where one component exceeds the budget on its own.
   */
  recurring: boolean;
}

/** One file the sweep read prose from, with the byte length a batch budget is measured against. */
export interface ScannedFile {
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** The file's byte length as read. */
  bytes: number;
}

/** What the record holds for one unit: the version swept, when it was last swept, and the path roots covered at that version. */
export interface UnitCoverage {
  /** The unit's version at the time of the sweep, opaque and never parsed as semver. */
  version: string;
  /** The ISO calendar date of the most recent sweep at this version. */
  'swept-at': string;
  /** The path roots that sweeps at this version have covered, `.` where one covered the repository. */
  roots: readonly string[];
}

/** One adjudicated rejection, keyed on its rule, its file, and the hash of its phrase. */
export interface RecordedRejection {
  rule: RuleId;
  /** The unit owning the rule, which is what a version bump marks stale. */
  unit: string;
  /** The unit's version when the rejection was recorded. */
  'unit-version': string;
  file: string;
  /** The phrase as it reads after the run's edits. */
  phrase: string;
  /** Hash of the phrase, which is the key a later run matches a candidate against. */
  hash: string;
  /** Why the site was left as it stands. */
  ground: string;
}

/** The per-repository sweep record. */
export interface ProseRecord {
  /** Coverage by unit name. */
  units: Record<string, UnitCoverage>;
  rejections: readonly RecordedRejection[];
}

/**
 * One rejection as a run reports it. It carries no hash and no version: the helper derives both, which is what keeps
 * the key a function of the phrase as it reads after the run's edits rather than of whatever a caller supplies.
 */
export interface FoldRejection {
  rule: RuleId;
  /** The unit owning the rule, which must be one the fold names. */
  unit: string;
  file: string;
  /** The phrase as it reads after the run's edits. */
  phrase: string;
  /** Why the site was left as it stands. */
  ground: string;
}

/** What one run reports back for recording: the units it covered and the rejections it adjudicated. */
export interface RunFold {
  /** The ISO calendar date to record the sweep under. */
  sweptAt: string;
  /** Per unit, the version swept and the path roots covered. */
  units: Record<string, { version: string; roots: readonly string[] }>;
  rejections: readonly FoldRejection[];
}

/** Why a file was held out of the sweep. */
export type SkipReason = 'generated' | 'ineligible' | 'machine-generated' | 'unreadable';

/** How a file's prose is delimited, which decides how the extractor reads it. */
export type ProseKind = 'markdown' | 'script' | 'shell' | 'yaml';

/**
 * A block of prose lifted out of a file: a Markdown paragraph, a comment, a string literal, a block scalar, or a
 * table cell.
 *
 * `text` preserves the source's own newlines, so the line holding any offset within it is `line` plus the newlines
 * preceding that offset. Every transformation applied by the extractor is line-preserving for that reason.
 */
export interface ProseSpan {
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** 1-indexed line on which the block begins. */
  line: number;
  /** The prose, stripped of the syntax that delimited it. */
  text: string;
}

/** The embedded subject's form, in the order the rulebook ranks it: worst first. */
export type SubjectShape = 'quantified' | 'definite' | 'bare' | 'pronoun';

/** Parsed command-line invocation of the sweep. */
export interface ParsedArgs {
  /** Paths narrowing the sweep; empty sweeps the whole repository. */
  paths: readonly string[];
  /** The rules to detect, each naming the unit owning it. Empty detects the legacy rule alone. */
  rules: ReadonlyArray<{ rule: RuleId; unit: string }>;
  /** The units in force, by name, each at the version the caller holds. Empty reads and writes no record. */
  units: ReadonlyMap<string, string>;
  /** Ceiling on a batch's combined file bytes. */
  budget: number;
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
  /** Files held out of the sweep, by the reason each was held out. */
  filesSkipped: Readonly<Record<SkipReason, number>>;
  /** Batches the run planned, before the record's coverage removed any. */
  batchesPlanned: number;
  /** Batches the record's coverage let the run skip. */
  batchesSkipped: number;
  /** Candidates carrying a rejection recorded at an older unit version, which re-opens them for review. */
  stale: number;
  /** Per-file counts, descending by count and then by path. */
  byFile: readonly FileCount[];
  /** Per-rule counts, keyed by every rule so a rule the invocation did not name reads as zero. */
  byRule: Readonly<Record<RuleId, number>>;
  /** Per-shape counts over the object-relative candidates, keyed by every shape so an absent shape reads as zero. */
  byShape: Readonly<Record<SubjectShape, number>>;
}

/** The helper's stdout payload on success. */
export interface DetectSuccess {
  ok: true;
  /** Repository root the sweep ran against. */
  root: string;
  candidates: readonly Candidate[];
  /** The batches left to adjudicate, those the record already covers having been dropped. */
  batches: readonly Batch[];
  summary: CandidateSummary;
}

/** Categorical error codes the helper returns without an unexpected throw. */
export type DetectErrorCode = 'invalid-args' | 'invalid-record' | 'not-a-repository';

/** The helper's stdout payload on a recoverable failure. */
export interface DetectFailure {
  ok: false;
  error: DetectErrorCode;
  message: string;
}

/** The helper's full stdout payload: a discriminated union on `ok`. */
export type DetectResult = DetectSuccess | DetectFailure;

/** What the `record` command reports once it has written the record. */
export interface RecordSuccess {
  ok: true;
  /** The record's repository-relative path. */
  path: string;
  /** How many units the written record covers. */
  units: number;
  /** How many rejections it holds. */
  rejections: number;
}

/** The `record` command's payload: a discriminated union on `ok`. */
export type RecordResult = RecordSuccess | DetectFailure;

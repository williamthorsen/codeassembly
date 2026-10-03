/** A candidate cut submitted to `check`: the file that it edits and the text that it removes or rewords. */
export interface CheckInput {
  file: string;
  phrase: string;
}

/** The evidence that `check` gathered against one candidate cut. */
export interface CheckReport extends CheckInput {
  /** Commits that changed how often the phrase occurs in the file, newest first. */
  history: PhraseCommit[];
  /** Test string literals that the phrase contains. */
  assertedBy: TestAssertion[];
}

export interface CheckSuccess {
  ok: true;
  reports: CheckReport[];
}

/** A cut's class, which the level of the run that proposed it allows. */
export type CutClass = 'aggressive' | 'conservative' | 'moderate';

/** A declined cut as the record stores it. */
export interface DeclinedCut extends DeclinedPhrase {
  'declined-at': string;
}

/** A declined cut as `resolve` reports it: enough to recognize a later candidate that touches the same text. */
export interface DeclinedPhrase {
  file: string;
  phrase: string;
  class: CutClass;
}

/** A guidance file that a run may cut, with what the skill needs to propose and commit a cut in it. */
export interface GuidanceFile {
  /** Path relative to the repository root. */
  file: string;
  bytes: number;
  /**
   * The bytes that the file deploys: for a file that deploys as a document, its size once its includes are expanded;
   * for one that deploys only inside the documents that include it, its own size times the number of documents that
   * it reaches. Absent for a file that lies outside every content root, and for one whose includes cannot be expanded.
   */
  deployedBytes?: number;
  /** Whether git reports uncommitted changes to the file, including an untracked file. */
  dirty: boolean;
  /** Line ranges that a deployment rewrites, such as an ambient region, inside which a run may not cut. */
  generatedRegions: LineRange[];
  /** The file's most recent review in the record, absent for a file that the record does not hold a review for. */
  lastReview?: LastReview;
  /** The path as the caller named it, when that path was a deployed copy of this file. */
  redirectedFrom?: string;
}

/** The repository's record: the cuts that the user declined, and the review of each file that a run read. */
export interface GuidanceRecord {
  declined: DeclinedCut[];
  reviewed: ReviewEntry[];
}

export type HelperError = 'invalid-args' | 'invalid-input' | 'invalid-record' | 'not-a-repository';

/** A structured failure. The helper exits 0 with one of these, keeping a non-zero exit for an unexpected throw. */
export interface HelperFailure {
  ok: false;
  error: HelperError;
  message: string;
}

/** A file's most recent review as `resolve` reports it. */
export interface LastReview {
  /** ISO calendar date of the run that reviewed the file. */
  reviewedAt: string;
  /** The bytes that the file deployed once that run's cuts were applied, absent when they could not be measured. */
  deployedBytes?: number;
}

/** A 1-based, inclusive range of lines. */
export interface LineRange {
  start: number;
  end: number;
}

/** A commit that changed how often a phrase occurs in its file. */
export interface PhraseCommit {
  sha: string;
  /** Author date, as an ISO 8601 timestamp. */
  date: string;
  subject: string;
  body: string;
}

/**
 * What one run reports back to `record`: the date of the run, the cuts that the user declined, and the
 * repository-relative files that it read.
 */
export interface RecordFold {
  date: string;
  declined: DeclinedPhrase[];
  reviewed: string[];
}

export interface RecordSuccess {
  ok: true;
  path: string;
  /** Entries in the written record's `declined` section. */
  declined: number;
  /** Entries in the written record's `reviewed` section. */
  reviewed: number;
}

/** A path that `resolve` could not accept as a target, with the reason. */
export interface RejectedPath {
  path: string;
  reason: RejectReason;
}

export type RejectReason =
  | 'ambiguous-source'
  | 'not-found'
  | 'not-markdown'
  | 'outside-repository'
  | 'saved-artifact'
  | 'source-not-in-repository'
  | 'unresolved-include';

export interface ResolveSuccess {
  ok: true;
  root: string;
  targets: GuidanceFile[];
  transitive: TransitiveFile[];
  declined: DeclinedPhrase[];
  rejected: RejectedPath[];
}

/** One file's most recent review as the record stores it. */
export interface ReviewEntry {
  file: string;
  'reviewed-at': string;
  'deployed-bytes'?: number | undefined;
}

/** A test string literal that a candidate phrase contains. */
export interface TestAssertion {
  file: string;
  line: number;
  literal: string;
}

/** How a transitive file is reached: a file includes it or links to it. */
export interface TransitiveEdge {
  from: string;
  kind: 'include' | 'link';
}

/** A file reached from a target, which a run may cut only at the lowest level. */
export interface TransitiveFile extends GuidanceFile {
  via: TransitiveEdge[];
}

// Shapes for the revise-prose helper: the prose extracted, the candidates detected, and the JSON payload
// written to stdout.
//
// The helper reports; it never writes. Repair selection is judgment, so the payload includes everything an adjudicator
// needs to decide without reading the file: the sentence, the matched phrase, and the shape that ranks the cost.

/** A detected site, discriminated on the rule whose detector reported it. */
export type Candidate =
  EmDashCandidate | ObjectRelativeCandidate | SecondPersonCandidate | SoCandidate | WhereCandidate;

/** What every candidate contains, whichever rule found it. */
export interface CandidateBase {
  /** The rule whose detector reported the site. */
  rule: RuleId;
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** 1-indexed line on which the sentence begins. */
  line: number;
  /**
   * The span that a repair rewrites. Distinctive within its file, which is what lets a recorded rejection resolve to
   * one site without a line number that the next edit invalidates.
   */
  phrase: string;
  /** The whole sentence containing the phrase, so that adjudication needs no file read. */
  sentence: string;
  /** Present when a rejection recorded at an older version of its rule matched, which re-opens it for review. */
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

/** One second-person site. Its phrase is the whole sentence, one pronoun being nothing a rejection could resolve against. */
export interface SecondPersonCandidate extends CandidateBase {
  rule: 'second-person';
}

/** One `so` site. Its phrase is the whole sentence, one word being nothing a rejection could resolve against. */
export interface SoCandidate extends CandidateBase {
  rule: 'so';
  /** Why the sentence was reported, which tells the adjudicator what to check. */
  trigger: SoTrigger;
}

/**
 * `bare`: a `so` that nothing before it marks as joining a result, which is almost always a purpose clause missing
 * "that". `repeat`: a `so` in the same sentence as another or in one of the three sentences after one.
 */
export type SoTrigger = 'bare' | 'repeat';

/** One `where` site. Its phrase is the whole sentence, one word being nothing a rejection could resolve against. */
export interface WhereCandidate extends CandidateBase {
  rule: 'where';
}

/** A rule for which the sweep has a detector. A rule without one is named by a plain string, as a unit is. */
export type RuleId = 'em-dash' | 'reduced-object-relative' | 'second-person' | 'so' | 'where';

/** One dispatch unit: whole files whose combined bytes fit the budget, in the order the sweep resolved them. */
export interface Batch {
  /** 0-indexed position in the run, the recurring batches leading. */
  index: number;
  /** The files that this batch covers. */
  files: readonly string[];
  /** Combined byte length of those files. */
  bytes: number;
  /**
   * Whether this batch contains components of files linked by a shared sentence. The budget binds it like any other,
   * except when one component exceeds the budget on its own.
   */
  recurring: boolean;
}

/** A batch as `detect` reports it: one left to adjudicate, with the versioned rules that its files still need. */
export interface ReportedBatch extends Batch {
  /** The versioned rules for which the record does not cover at least one of this batch's files, sorted. */
  unswept: readonly string[];
}

/** One file from which the sweep read prose, with the byte length against which a batch budget is measured. */
export interface ScannedFile {
  /** Path to the source file, relative to the repository root. */
  file: string;
  /** The file's byte length as read. */
  bytes: number;
}

/**
 * What the record stores for one rule: the sweep version swept, when it was last swept, whether its detector ran, and
 * the path roots covered at that version.
 */
export interface RuleCoverage {
  /** The rule's sweep version at the time of the sweep. */
  version: string;
  /** The ISO calendar date of the most recent sweep at this version. */
  'swept-at': string;
  /** Whether the rule's detector nominated candidates for these roots. */
  detected: boolean;
  /** The path roots that sweeps at this version have covered, `.` when one covered the repository. */
  roots: readonly string[];
}

/** One adjudicated rejection, resolved to a site by its rule, its file, and its phrase. */
export interface RecordedRejection {
  /**
   * The rule under which the site was adjudicated. Any versioned rule declared by a bound rulebook, whether or not the
   * helper has a detector for it, so that a sweeper's judgment is recorded without a detector.
   */
  rule: string;
  /** The rule's sweep version when the rejection was recorded, which a raised version marks stale. */
  'rule-version': string;
  file: string;
  /** The phrase as it reads after the run's edits, which a later run matches a candidate against by containment. */
  phrase: string;
  /** Why the site was left as it stands. */
  ground: string;
}

/**
 * One rejection inherited by a later run: a site that an earlier sweep adjudicated and left, at a version of its
 * rule that still stands.
 */
export interface PriorRejection {
  rule: string;
  file: string;
  /** The phrase as the earlier sweep left it. */
  phrase: string;
}

/** One file as the `record` command reads it to decide whether a rejection's site still exists. */
export interface SiteText {
  /** The file's extracted prose: its spans joined by newlines, each with its inline code spans masked. */
  prose: string;
  /** The file's content as read. */
  content: string;
}

/** The per-repository sweep record. */
export interface ProseRecord {
  /** Coverage by rule name. */
  rules: Record<string, RuleCoverage>;
  rejections: readonly RecordedRejection[];
}

/** What a record written before rules were versioned stores for one unit, a rulebook or `plain-speech`. */
export interface LegacyUnitCoverage {
  version: string;
  'swept-at': string;
  /** The rules whose detectors nominated candidates for these roots. */
  rules: readonly string[];
  roots: readonly string[];
}

/** One rejection as a record written before rules were versioned stores it, stale by its unit's version. */
export interface LegacyRejection {
  rule: string;
  unit: string;
  'unit-version': string;
  file: string;
  phrase: string;
  ground: string;
}

/** A record written before rules were versioned, whose coverage and rejections are keyed on a unit's version. */
export interface LegacyRecord {
  units: Record<string, LegacyUnitCoverage>;
  rejections: readonly LegacyRejection[];
}

/** A versioned rule as a run names it: its sweep version and the unit owning it. */
export interface VersionedRule {
  unit: string;
  version: string;
}

/**
 * The versions in force for a run: each named unit's, which converting a legacy record reads, and each versioned
 * rule's, which keys coverage and rejections.
 */
export interface SweepVersions {
  units: ReadonlyMap<string, string>;
  rules: ReadonlyMap<string, VersionedRule>;
}

/**
 * One rejection as a run reports it. It names no version, which the helper derives from the fold's entry for its rule.
 */
export interface FoldRejection {
  /** The rule under which the site was adjudicated, detected or not, which must be one that the fold versions. */
  rule: string;
  file: string;
  /** The phrase as it reads after the run's edits. */
  phrase: string;
  /** Why the site was left as it stands. */
  ground: string;
}

/** What one run reports back for recording: the rules that it covered and the rejections that it adjudicated. */
export interface RunFold {
  /** The ISO calendar date to record the sweep under. */
  sweptAt: string;
  /** The path roots that the run covered. */
  roots: readonly string[];
  /** Each unit named by the run, at its version. */
  units: Record<string, string>;
  /** Each versioned rule named by the run, with its unit and sweep version. */
  rules: Record<string, VersionedRule>;
  rejections: readonly FoldRejection[];
}

/** Why a file was excluded from the sweep. */
export type SkipReason = 'generated' | 'ineligible' | 'machine-generated' | 'unreadable' | 'vendored';

/** How a file's prose is delimited, which decides how the extractor reads it. */
export type ProseKind = 'markdown' | 'script' | 'shell' | 'yaml';

/**
 * A block of prose lifted out of a file: a Markdown paragraph, a comment, a string literal, a block scalar, or a
 * table cell.
 *
 * `text` preserves the source's own newlines, so the line containing any offset within it is `line` plus the newlines
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
  /**
   * The rules named, each with the unit owning it and its sweep version when it has one, whether or not the helper has
   * a detector for it. Empty detects the legacy rule alone.
   */
  rules: readonly NamedRule[];
  /** The units in force, by name, each at the version that the caller names. Empty reads and writes no record. */
  units: ReadonlyMap<string, string>;
  /** Ceiling on a batch's combined file bytes. */
  budget: number;
}

/** A rule as an invocation names it. A rule with no sweep version is swept but never recorded. */
export interface NamedRule {
  rule: string;
  unit: string;
  version: string | undefined;
}

/** How many candidates a file contributes, so that a large sweep can be narrowed before adjudication is paid for. */
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
  /** Files excluded from the sweep, by the reason each was excluded. */
  filesSkipped: Readonly<Record<SkipReason, number>>;
  /** Batches that the run planned, before the record's coverage removed any. */
  batchesPlanned: number;
  /** Batches that the record's coverage let the run skip. */
  batchesSkipped: number;
  /** Candidates with a rejection recorded at an older version of their rule, which re-opens them for review. */
  stale: number;
  /** Per-file counts, descending by count and then by path. */
  byFile: readonly FileCount[];
  /** Per-rule counts, keyed by every rule so that a rule not named by the invocation reads as zero. */
  byRule: Readonly<Record<RuleId, number>>;
  /**
   * Per-shape counts over the object-relative candidates, keyed by every shape so that an absent shape reads as zero.
   */
  byShape: Readonly<Record<SubjectShape, number>>;
}

/** The helper's stdout payload on success. */
export interface DetectSuccess {
  ok: true;
  /** Repository root against which the sweep ran. */
  root: string;
  /**
   * The candidates in the reported batches' files, each under a rule that its batch lists as unswept or under a rule
   * that the run does not version.
   */
  candidates: readonly Candidate[];
  /**
   * Sites for which the record already contains a live rejection, in the reported batches' files and under a rule that
   * the batch lists as unswept. A sweeper given these leaves each under the rule that its entry names and judges it
   * under every other rule that the batch applies; one recorded at an older version of its rule, or under a rule that
   * the run does not version, is absent, and its site is judged afresh.
   */
  rejections: readonly PriorRejection[];
  /** The batches left to adjudicate, those that the record already covers for every versioned rule having been dropped. */
  batches: readonly ReportedBatch[];
  /**
   * The rules that the run detected, and the named rules for which the helper has no detector, each sorted. A name in
   * `undetected` that a rulebook meant as a detector rule is misspelt.
   */
  rules: { detected: readonly RuleId[]; undetected: readonly string[] };
  summary: CandidateSummary;
}

/** Categorical error codes that the helper returns without an unexpected throw. */
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
  /** How many rules the written record covers. */
  rules: number;
  /** How many rejections it contains. */
  rejections: number;
}

/** The `record` command's payload: a discriminated union on `ok`. */
export type RecordResult = RecordSuccess | DetectFailure;

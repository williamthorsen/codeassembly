// Shapes for the revise-prose helper: the prose extracted, the candidates detected, and the JSON payload
// written to stdout.
//
// The helper reports; it never writes. Repair selection is judgment, so the payload carries everything an adjudicator
// needs to decide without reading the file: the sentence, the matched phrase, and the shape that ranks the cost.

/** A detected site, discriminated on the rule whose detector reported it. */
export type Candidate =
  EmDashCandidate | ObjectRelativeCandidate | SecondPersonCandidate | SoCandidate | WhereCandidate;

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
  /** Present where a rejection recorded at an older version of its rule matched, which re-opens it for review. */
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

/**
 * What the record holds for one rule: the sweep version swept, when it was last swept, whether its detector ran, and
 * the path roots covered at that version.
 */
export interface RuleCoverage {
  /** The rule's sweep version at the time of the sweep. */
  version: string;
  /** The ISO calendar date of the most recent sweep at this version. */
  'swept-at': string;
  /** Whether the rule's detector nominated candidates for these roots. */
  detected: boolean;
  /** The path roots that sweeps at this version have covered, `.` where one covered the repository. */
  roots: readonly string[];
}

/** One adjudicated rejection, resolved to a site by its rule, its file, and its phrase. */
export interface RecordedRejection {
  /**
   * The rule the site was adjudicated under. Any versioned rule a bound rulebook declares, whether or not the helper
   * holds a detector for it, so a sweeper's judgment is recorded without a detector.
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
 * One rejection a later run inherits: a site an earlier sweep adjudicated and left, at a version of its unit that
 * still stands. The sweeper needs no argument for a settled site, so the record's own bookkeeping is left behind.
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

/** What a record written before rules were versioned holds for one unit, a rulebook or `plain-speech`. */
export interface LegacyUnitCoverage {
  version: string;
  'swept-at': string;
  /** The rules whose detectors nominated candidates for these roots. */
  rules: readonly string[];
  roots: readonly string[];
}

/** One rejection as a record written before rules were versioned holds it, stale by its unit's version. */
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
 * The versions a run holds: each named unit's, which converting a legacy record reads, and each versioned rule's, which
 * keys coverage and rejections.
 */
export interface SweepVersions {
  units: ReadonlyMap<string, string>;
  rules: ReadonlyMap<string, VersionedRule>;
}

/**
 * One rejection as a run reports it. It carries no version, which the helper derives from the fold's entry for its rule.
 */
export interface FoldRejection {
  /** The rule the site was adjudicated under, detected or not, which must be one the fold versions. */
  rule: string;
  file: string;
  /** The phrase as it reads after the run's edits. */
  phrase: string;
  /** Why the site was left as it stands. */
  ground: string;
}

/** What one run reports back for recording: the rules it covered and the rejections it adjudicated. */
export interface RunFold {
  /** The ISO calendar date to record the sweep under. */
  sweptAt: string;
  /** The path roots the run covered. */
  roots: readonly string[];
  /** Each unit the run named, at its version. */
  units: Record<string, string>;
  /** Each versioned rule the run named, with its unit and sweep version. */
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
  /**
   * The rules named, each with the unit owning it and its sweep version where it has one, whether or not the helper has
   * a detector for it. Empty detects the legacy rule alone.
   */
  rules: readonly NamedRule[];
  /** The units in force, by name, each at the version the caller holds. Empty reads and writes no record. */
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
  /** Files excluded from the sweep, by the reason each was excluded. */
  filesSkipped: Readonly<Record<SkipReason, number>>;
  /** Batches the run planned, before the record's coverage removed any. */
  batchesPlanned: number;
  /** Batches the record's coverage let the run skip. */
  batchesSkipped: number;
  /** Candidates carrying a rejection recorded at an older version of their rule, which re-opens them for review. */
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
  /**
   * Sites the record already holds a live rejection for, over the files the sweep read. A sweeper given these leaves
   * each under the rule its entry names and judges it under every other; one recorded at an older version of its rule,
   * or under a rule the run does not version, is absent, so its site is judged afresh.
   */
  rejections: readonly PriorRejection[];
  /** The batches left to adjudicate, those the record already covers having been dropped. */
  batches: readonly Batch[];
  /**
   * The rules that the run detected, and the named rules for which the helper has no detector, each sorted. A name in
   * `undetected` that a rulebook meant as a detector rule is misspelt.
   */
  rules: { detected: readonly RuleId[]; undetected: readonly string[] };
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
  /** How many rules the written record covers. */
  rules: number;
  /** How many rejections it holds. */
  rejections: number;
}

/** The `record` command's payload: a discriminated union on `ok`. */
export type RecordResult = RecordSuccess | DetectFailure;

// Shapes for the streamline-guidance helper: the files that a run may cut and the record of cuts that the user declined.

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

/** The record of declined cuts. */
export interface DeclineRecord {
  declined: DeclinedCut[];
}

/** A guidance file that a run may cut, with what the skill needs to propose and commit a cut in it. */
export interface GuidanceFile {
  /** Path relative to the repository root. */
  file: string;
  bytes: number;
  /** Whether git reports uncommitted changes to the file, including an untracked file. */
  dirty: boolean;
  /** Line ranges that a deployment rewrites, such as an ambient region, inside which no cut may fall. */
  generatedRegions: LineRange[];
  /** The path as the caller named it, where that path was a deployed copy of this file. */
  redirectedFrom?: string;
}

export type HelperError = 'invalid-args' | 'invalid-include' | 'invalid-record' | 'not-a-repository';

/** A structured failure. The helper exits 0 with one of these, keeping a non-zero exit for an unexpected throw. */
export interface HelperFailure {
  ok: false;
  error: HelperError;
  message: string;
}

/** A 1-based, inclusive range of lines. */
export interface LineRange {
  start: number;
  end: number;
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
  | 'sealed-artifact'
  | 'source-not-in-repository';

export interface ResolveSuccess {
  ok: true;
  root: string;
  targets: GuidanceFile[];
  transitive: TransitiveFile[];
  declined: DeclinedPhrase[];
  rejected: RejectedPath[];
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

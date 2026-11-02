/** An addressed feedback event to which a duplicate can point, with only the references that a duplicate copies. */
export interface ReferenceEntry {
  id: string;
  summary: string;
  excerpt: string;
  references: string[];
}

/** A guidance repository pinned at the commit of its default branch, against which a judge reads guidance. */
export interface Pin {
  /** The repository's `owner/repo` on GitHub. */
  repo: string;
  root: string;
  branch: string;
  sha: string;
  /** The source directories that resolved to this repository. */
  sources: string[];
}

/** A source directory that could not be pinned, with the reason. */
export interface SkippedSource {
  source: string;
  reason: string;
}

/** The bins into which a judge sorts each event. */
export const BINS = ['covered', 'duplicate', 'obsolete', 'kept'] as const;

export type Bin = (typeof BINS)[number];

/** A defect in a judge's bins file, reported with every other defect rather than one at a time. */
export interface BinViolation {
  file: string;
  event: string | null;
  message: string;
}

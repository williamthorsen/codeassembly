// Shapes for the feedback-memories helper: the enumerated feedback-memory record, and the JSON results emitted
// to stdout by the `enumerate` and `delete` subcommands.
//
// Each helper subcommand prints a discriminated union on `ok`. Recoverable failures return `{ ok: false, error, message }`;
// successes return `{ ok: true, ... }`. System errors (permission denied, out-of-disk) print to stderr and exit non-zero.

/**
 * A single feedback memory discovered during enumeration, carrying the provenance a caller needs to route it. Identity
 * is drawn from parsed frontmatter, not the filename, so both the legacy top-level `type:` schema and the current nested
 * `metadata.type:` schema are represented uniformly here.
 */
export interface FeedbackMemory {
  /** Absolute path to the memory file. */
  path: string;
  /** The project-store slug (the `<project>` directory name under the projects root); the origin-project identifier. */
  store: string;
  /**
   * Absolute path to the origin project's working directory when the store slug resolves to a live repo on this
   * machine, else `null`. Lets a caller ground routing decisions in that project's guidance; `null` when the slug
   * decodes to no existing directory (a dead store, or a name whose `.` punctuation cannot be recovered).
   */
  repoPath: string | null;
  /** Machine hostname captured at enumeration time. */
  machine: string;
  /** Filename stem, without the `.md` extension. */
  slug: string;
  /** The frontmatter `name`, when present (a slug in newer stores, a human title in older ones). */
  name: string | null;
  /** The frontmatter `description`, when present. */
  description: string | null;
  /** The originating session id, read from `metadata.originSessionId` or a top-level `originSessionId`, when present. */
  originSessionId: string | null;
  /** The memory body (everything after the frontmatter block). */
  body: string;
  /** Absolute path to the sibling `MEMORY.md` index for this store. */
  memoryIndexPath: string;
}

/** A memory file that could not be read as a note, surfaced rather than silently dropped. */
export interface SkippedMemory {
  /** Absolute path to the unreadable file. */
  path: string;
  /** Why the file was skipped (missing or malformed frontmatter). */
  reason: string;
}

/** The `enumerate` subcommand's stdout payload on success. */
export interface EnumerateSuccess {
  ok: true;
  /** Machine hostname the enumeration ran on. */
  machine: string;
  /** Absolute path of the projects root that was walked. */
  projectsRoot: string;
  /** Every feedback memory found, ordered by store then slug for stable output. */
  memories: FeedbackMemory[];
  /** Files whose frontmatter could not be parsed. */
  skipped: SkippedMemory[];
}

/** The `enumerate` subcommand's stdout payload when the projects root is absent, or a `--store` names no store. */
export interface EnumerateFailure {
  ok: false;
  error: 'no-projects-root' | 'no-such-store';
  message: string;
}

export type EnumerateResult = EnumerateSuccess | EnumerateFailure;

/** The outcome of deleting one memory and reconciling its store's `MEMORY.md`. */
export interface DeleteOutcome {
  /** Absolute path of the memory targeted for deletion. */
  path: string;
  /** Whether the file was removed (false when it was already absent). */
  deleted: boolean;
  /** Whether a matching `MEMORY.md` line was found and removed. */
  indexUpdated: boolean;
  /** A non-fatal note, e.g. the file was already gone or the store has no `MEMORY.md` line for it. */
  note?: string;
}

/** The `delete` subcommand's stdout payload on success (per-path outcomes are individually reported). */
export interface DeleteSuccess {
  ok: true;
  results: DeleteOutcome[];
}

/** The stdout payload for a recoverable helper failure (bad arguments or an unknown subcommand). */
export interface FeedbackMemoriesFailure {
  ok: false;
  error: 'invalid-args';
  message: string;
}

export type DeleteResult = DeleteSuccess | FeedbackMemoriesFailure;

export type FeedbackMemoriesResult = EnumerateResult | DeleteResult;

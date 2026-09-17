// Shapes for the feedback-memories helper.
//
// Each subcommand prints a discriminated union on `ok`: `{ ok: false, error, message }` on a recoverable failure and
// `{ ok: true, ... }` on a success. On a system error (permission denied, out-of-disk), the helper prints to stderr
// and exits non-zero.

/**
 * A single feedback memory discovered during enumeration, with the provenance that a caller needs to route it.
 */
export interface FeedbackMemory {
  /** Absolute path to the memory file. */
  path: string;
  /** The memory-store slug (the `<project>` directory name under the projects root); the origin-project identifier. */
  memoryStore: string;
  /**
   * Absolute path to the origin project's working directory when the memory-store slug resolves to a live repo on this
   * machine, else `null`. Lets a caller ground routing decisions in that project's guidance.
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
  /** Absolute path to the sibling `MEMORY.md` index for this memory store. */
  memoryIndexPath: string;
}

/** A memory file that enumeration could not read as a note. */
export interface SkippedMemory {
  /** Absolute path to the unreadable file. */
  path: string;
  /** Why the file was skipped (frontmatter that could not be parsed). */
  reason: string;
}

/** The `enumerate` subcommand's stdout payload on success. */
export interface EnumerateSuccess {
  ok: true;
  /** Hostname of the machine on which the enumeration ran. */
  machine: string;
  /** Absolute path of the projects root that was walked. */
  projectsRoot: string;
  /** Every feedback memory found, ordered by memory store then slug for stable output. */
  memories: FeedbackMemory[];
  /** Files whose frontmatter could not be parsed. */
  skipped: SkippedMemory[];
}

/** The `enumerate` subcommand's stdout payload when the walk cannot start; `error` names the condition. */
export interface EnumerateFailure {
  ok: false;
  error: 'ambiguous-memory-store' | 'no-projects-root' | 'no-such-memory-store';
  message: string;
}

export type EnumerateResult = EnumerateSuccess | EnumerateFailure;

/** A single memory's identity within a project summary, included for verbose rendering. */
export interface MemorySummary {
  /** Filename stem, without the `.md` extension. */
  slug: string;
  /** The frontmatter `description`, when present. */
  description: string | null;
}

/** One memory store's feedback-memory rollup. */
export interface ProjectSummary {
  /** The memory-store slug (the `<project>` directory name under the projects root). */
  memoryStore: string;
  /** Display label for the store, as `deriveLabel` derives it. */
  label: string;
  /** Absolute path to the origin repo when the slug resolves to a live directory, else null. */
  repoPath: string | null;
  /** Number of feedback memories in the memory store. */
  count: number;
  /** ISO-8601 modification time of the memory store's most recently modified memory file. */
  lastModified: string;
  /** Each memory's slug and description, ordered by slug. */
  memories: MemorySummary[];
}

/** The per-project rollup returned by `summarizeFeedbackMemories`. */
export interface FeedbackMemorySummary {
  ok: true;
  /** Hostname of the machine on which the summary was computed. */
  machine: string;
  /** Absolute path of the projects root that was walked. */
  projectsRoot: string;
  /** One entry per memory store, sorted alphabetically by label. */
  projects: ProjectSummary[];
  /** Total feedback memories across every listed project. */
  total: number;
  /** Files whose frontmatter could not be parsed, passed through from enumeration. */
  skipped: SkippedMemory[];
}

export type SummarizeResult = FeedbackMemorySummary | EnumerateFailure;

/** The outcome of deleting one memory and reconciling its store's `MEMORY.md`. */
export interface DeleteOutcome {
  /** Absolute path of the memory targeted for deletion. */
  path: string;
  /** Whether the file was removed (false when it was already absent). */
  deleted: boolean;
  /** Whether a matching `MEMORY.md` line was found and removed. */
  indexUpdated: boolean;
  /** A non-fatal note, present only when the delete was not clean. */
  note?: string;
}

/** The `delete` subcommand's stdout payload on success. */
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

/**
 * What `runFeedbackMemories` returns to the process entry point: a JSON-serializable result, or text already rendered
 * for a human reader.
 */
export type RenderedResult = { render: 'json'; value: FeedbackMemoriesResult } | { render: 'text'; value: string };

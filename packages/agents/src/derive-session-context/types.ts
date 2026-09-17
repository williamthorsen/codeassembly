/** Shared types for the session-context deriver. */

/** A narrow projection of `schemas/preferences.json` covering the fields that the deriver consumes. */
export interface ResolvedPreferences {
  /** The VCS host. */
  readonly scm?: 'github' | 'bitbucket';
  readonly project?: {
    readonly slug?: string;
    readonly ticket_ref_prefix?: string;
  };
  readonly repository?: {
    /** A deprecated fallback for `project.slug`. */
    readonly slug?: string;
    readonly default_remote?: {
      readonly name?: string;
      readonly default_branch?: string;
    };
  };
  readonly artifacts?: {
    readonly base_dir?: string;
    readonly paths?: Readonly<Record<string, string>>;
  };
  readonly ticket?: {
    /** The org-stable base to which a bare ticket id is appended (e.g. Jira `https://org.atlassian.net/browse/`). */
    readonly base_url?: string;
  };
}

/** Result of reading and merging the project and global preferences files. */
export interface PreferencesReadResult {
  /** The merged preferences, projected to the fields that the deriver consumes. */
  readonly preferences: ResolvedPreferences;
  /** The source-file paths present and read. */
  readonly sources: {
    readonly project?: string;
    readonly global?: string;
  };
}

/** Parsed ticket-ID extraction result. */
export interface TicketIdResult {
  readonly ticket_id: string | null;
  readonly ticket_ref: string | null;
}

/**
 * The canonical session-context manifest persisted at `.agents/{sanitized-branch}.branch-manifest.json`. Its optional
 * fields stay out of the required-field set, so a manifest written before one of them existed remains valid.
 */
export interface BranchManifest {
  readonly ticket_id: string | null;
  readonly ticket_ref: string | null;
  readonly project_slug: string;
  readonly scm: 'github' | 'bitbucket';
  readonly default_branch: string;
  readonly branch_name: string;
  readonly artifact_base_dir: string;
  readonly artifact_paths: Readonly<Record<string, string>>;
  readonly created_at: string;
  /** The resolved ticket URL, stored so that consumers can prefer it over reconstructing one from `ticket_id`. */
  readonly ticket_url?: string | null;
  /**
   * The org-stable base URL to which a bare ticket id is appended, copied from the `ticket.base_url` preference. Lets
   * skills expand a bare reference to a full URL on platforms where one can't be reconstructed (e.g. Jira).
   */
  readonly ticket_base_url?: string | null;
  /**
   * The resolved pull-request URL, stored so that PR-aware skills can reuse it across sessions. A fresh compose
   * initializes it from a `PR-<n>` branch identity, or to `null` otherwise.
   */
  readonly pr_url?: string | null;
}

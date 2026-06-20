/** Shared types for the session-context deriver. */

/** A narrow projection of `schemas/preferences.json` covering the fields the deriver consumes. */
export interface ResolvedPreferences {
  /** Top-level `scm`, the VCS host (`"github"` or `"bitbucket"`); may be undefined when not configured. */
  readonly scm?: 'github' | 'bitbucket';
  /** `project.slug`, `project.ticket_ref_prefix`. */
  readonly project?: {
    readonly slug?: string;
    readonly ticket_ref_prefix?: string;
  };
  /** `repository.slug` (deprecated fallback), `repository.default_remote.{name,default_branch}`. */
  readonly repository?: {
    readonly slug?: string;
    readonly default_remote?: {
      readonly name?: string;
      readonly default_branch?: string;
    };
  };
  /** `artifacts.base_dir`, `artifacts.paths.*`. */
  readonly artifacts?: {
    readonly base_dir?: string;
    readonly paths?: Readonly<Record<string, string>>;
  };
}

/** Result of reading and merging the project and global preferences files. */
export interface PreferencesReadResult {
  /**
   * The merged preferences, projected to the fields the deriver consumes.
   * Unknown sibling keys at any depth are dropped; wrong-typed consumed fields throw at read time.
   */
  readonly preferences: ResolvedPreferences;
  /** Source-file paths actually present and read (project, global). */
  readonly sources: {
    readonly project?: string;
    readonly global?: string;
  };
}

/** Parsed ticket-ID extraction result. Both fields are nullable when no ID can be derived. */
export interface TicketIdResult {
  readonly ticket_id: string | null;
  readonly ticket_ref: string | null;
}

/** The canonical session-context manifest persisted at `.agents/{sanitized-branch}.branch-manifest.json`. */
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
  /**
   * The resolved ticket URL, stored so consumers can prefer it over reconstructing one from
   * `ticket_id`. Optional and excluded from the required-field set so pre-existing manifests stay
   * valid; a fresh compose seeds `null`.
   */
  readonly ticket_url?: string | null;
  /**
   * The resolved pull-request URL, stored so PR-aware skills can reuse it across sessions. Optional
   * and excluded from the required-field set so pre-existing manifests stay valid; a fresh compose
   * seeds `null`.
   */
  readonly pr_url?: string | null;
}

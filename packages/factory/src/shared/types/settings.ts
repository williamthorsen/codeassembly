/** A single dismissed-run entry recording the run's status at dismissal time. */
export interface DismissedRunEntry {
  status: string;
}

/** User settings persisted to disk. */
export interface UserSettings {
  dismissedRuns: Record<string, DismissedRunEntry>;
}

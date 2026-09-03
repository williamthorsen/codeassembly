import { type ContentDefect, formatContentDefects } from '../../lib/content-defects.ts';

/**
 * Every defect a sync's pre-write validation found, raised once so a run reports the whole list rather than its first
 * entry. The message carries the grouped report, so any consumer reading the error alone still sees what to fix; the
 * defects travel alongside it for the CLI, which renders them without the top-level `Error:` prefix a finding list
 * must not wear.
 */
export class SyncValidationError extends Error {
  readonly defects: ReadonlyArray<ContentDefect>;

  constructor(defects: ReadonlyArray<ContentDefect>) {
    super(`sync found ${defects.length} defect(s) and wrote nothing:\n\n${formatContentDefects(defects)}`);
    this.name = 'SyncValidationError';
    this.defects = defects;
  }
}

/** Narrows a caught error to the aggregate a pre-write validation raises. */
export function isSyncValidationError(error: unknown): error is SyncValidationError {
  return error instanceof SyncValidationError;
}

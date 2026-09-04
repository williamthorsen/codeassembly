import { describeError } from '@williamthorsen/toolbelt.errors';

import { type ContentDefect, formatContentDefects } from '../../lib/content-defects.ts';
import type { HomeFailure } from '../../lib/home-provenance.ts';

/**
 * Describes a failed home-domain sync for the provenance record, carrying the whole defect report where the failure
 * has one. The report is held for a reader who opens the stamp; `status` prints the count alone, because a stored
 * report describes the content as it stood at the attempt rather than as it stands now.
 */
export function describeSyncFailure(error: unknown): HomeFailure {
  return isSyncValidationError(error)
    ? { summary: formatContentDefects(error.defects), defectCount: error.defects.length }
    : { summary: describeError(error) };
}

/** Narrows a caught error to the aggregate a pre-write validation raises. */
export function isSyncValidationError(error: unknown): error is SyncValidationError {
  return error instanceof SyncValidationError;
}

/**
 * Every defect a sync's pre-write validation found, raised once so a run reports the whole list rather than its first
 * entry. The message carries the grouped report, so any consumer reading the error alone still sees what to fix; the
 * defects travel alongside it for the CLI, which renders them without the top-level `Error:` prefix that a finding
 * list must not wear.
 */
export class SyncValidationError extends Error {
  readonly defects: ReadonlyArray<ContentDefect>;

  constructor(defects: ReadonlyArray<ContentDefect>) {
    super(`sync found ${defects.length} defect(s) and wrote nothing:\n\n${formatContentDefects(defects)}`);
    this.name = 'SyncValidationError';
    this.defects = defects;
  }
}

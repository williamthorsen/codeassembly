import { describeError } from '@williamthorsen/toolbelt.errors';

import { type ContentDefect, formatContentDefects } from '../../lib/content-defects.ts';
import type { HomeFailure } from '../../lib/home-provenance.ts';

/**
 * Describes a failed home-domain sync for the provenance record, including the whole defect report when the failure
 * has one. The report is kept for a reader who opens the stamp; `status` prints the count alone, because a stored
 * report describes the content as it stood at the attempt rather than as it stands now.
 */
export function describeSyncFailure(error: unknown): HomeFailure {
  return isSyncValidationError(error)
    ? { summary: formatContentDefects(error.defects), defectCount: error.defects.length }
    : { summary: describeError(error) };
}

/** Narrows a caught error to the aggregate raised by a pre-write validation. */
export function isSyncValidationError(error: unknown): error is SyncValidationError {
  return error instanceof SyncValidationError;
}

/**
 * Every defect found by a sync's pre-write validation, raised once so that a run reports the whole list rather than
 * its first entry. The message contains the grouped report, so any consumer reading the error alone still sees what to
 * fix; the defects are stored alongside it for the CLI, which renders them without the top-level `Error:` prefix that
 * a finding list must not have.
 */
export class SyncValidationError extends Error {
  readonly defects: ReadonlyArray<ContentDefect>;

  constructor(defects: ReadonlyArray<ContentDefect>) {
    super(`sync found ${defects.length} defect(s) and wrote nothing:\n\n${formatContentDefects(defects)}`);
    this.name = 'SyncValidationError';
    this.defects = defects;
  }
}

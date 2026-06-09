import type { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';

import { isErrorCode } from '../type-guards.ts';

/** Controls which `stat` failures a filesystem-existence check treats as "absent". */
export interface ExistsOptions {
  /**
   * Stat-error codes treated as "absent" (the helper returns `false`). Any other failure is re-thrown so a genuine
   * error — most importantly a permission denial on a path that does exist — is not silently read as absence.
   * Defaults to `['ENOENT']`.
   */
  absentCodes?: readonly string[];
  /**
   * When `true`, every `stat` failure is treated as "absent" (`false`), including permission errors.
   * Reserved for best-effort probes such as an ancestor walk, where an unreadable path should be skipped rather than
   * abort the operation. Takes precedence over `absentCodes`.
   */
  treatErrorsAsAbsent?: boolean;
}

/** Returns true when `path` exists and is a directory. See {@link ExistsOptions} for the absence policy. */
export async function directoryExists(path: string, options: ExistsOptions = {}): Promise<boolean> {
  return statExists(path, options, (stats) => stats.isDirectory());
}

/** Returns true when something exists at `path`. See {@link ExistsOptions} for the absence policy. */
export async function pathExists(path: string, options: ExistsOptions = {}): Promise<boolean> {
  return statExists(path, options, () => true);
}

// region | Helpers

const DEFAULT_ABSENT_CODES: readonly string[] = ['ENOENT'];

/**
 * Stats `path` and projects success through `onStats`. Maps an "absent" stat failure to `false` per `options`;
 * re-throws every other failure so it surfaces rather than being indistinguishable from absence.
 */
async function statExists(path: string, options: ExistsOptions, onStats: (stats: Stats) => boolean): Promise<boolean> {
  try {
    return onStats(await stat(path));
  } catch (error) {
    if (options.treatErrorsAsAbsent) {
      return false;
    }
    const absentCodes = options.absentCodes ?? DEFAULT_ABSENT_CODES;
    if (absentCodes.some((code) => isErrorCode(error, code))) {
      return false;
    }
    throw error;
  }
}

// endregion | Helpers

import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent } from '../lib/type-guards.ts';

/** The mode of every run directory that a skill creates. */
const INTERACTIVE_MODE = 'interactive';

/** A review that `findLatestReview` selected, with the run directory that contains it. */
export interface LatestReview {
  reviewPath: string;
  runDir: string;
}

// The capture group is the UTC `YYYYMMDD-HHMMSSZ` timestamp; its fixed width makes string order chronological.
const REVIEW_FILE_PATTERN = /^(\d{8}-\d{6}Z)_(?:overseer|reviewer)_review\.md$/;
const RUN_DIR_PATTERN = /^(\d{8}-\d{6}Z)-[a-z]+$/;
const TIMESTAMP_PATTERN = /^\d{8}-\d{6}Z$/;

/** Creates the `{timestamp}-interactive` run directory, with any missing parents, and returns its path. */
export async function createRun(ticketDir: string, timestamp: string): Promise<string> {
  if (!TIMESTAMP_PATTERN.test(timestamp)) {
    throw new Error(`timestamp must be UTC YYYYMMDD-HHMMSSZ, got '${timestamp}'`);
  }
  const runDir = path.join(ticketDir, `${timestamp}-${INTERACTIVE_MODE}`);
  await mkdir(runDir, { recursive: true });
  return runDir;
}

/**
 * Finds the newest run directory in `ticketDir` and the newest reviewer or overseer review in it, both by the timestamp
 * in their names. Throws when the ticket directory does not contain a run, or the newest run does not contain a review.
 */
export async function findLatestReview(ticketDir: string): Promise<LatestReview> {
  const runDirName = selectNewest(await listEntryNames(ticketDir, 'directory'), RUN_DIR_PATTERN);
  if (runDirName === undefined) {
    throw new Error(`no run directory found in ${ticketDir}`);
  }
  const runDir = path.join(ticketDir, runDirName);
  const reviewName = selectNewest(await listEntryNames(runDir, 'file'), REVIEW_FILE_PATTERN);
  if (reviewName === undefined) {
    throw new Error(`no reviewer or overseer review found in ${runDir}`);
  }
  return { reviewPath: path.join(runDir, reviewName), runDir };
}

// region | Helpers

/** Lists the names of the directory's entries of one kind; a missing directory has none. */
async function listEntryNames(dir: string, kind: 'directory' | 'file'): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => (kind === 'directory' ? entry.isDirectory() : entry.isFile()))
      .map((entry) => entry.name);
  } catch (error) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Returns the name with the greatest timestamp captured by `pattern`, skipping names that do not match. A tie on the
 * timestamp is broken by the whole name, so that the selection does not depend on directory-listing order.
 */
function selectNewest(names: readonly string[], pattern: RegExp): string | undefined {
  let newest: { name: string; timestamp: string } | undefined;
  for (const name of names) {
    const timestamp = pattern.exec(name)?.[1];
    if (timestamp === undefined) {
      continue;
    }
    if (
      newest === undefined ||
      timestamp > newest.timestamp ||
      (timestamp === newest.timestamp && name > newest.name)
    ) {
      newest = { name, timestamp };
    }
  }
  return newest?.name;
}

// endregion | Helpers

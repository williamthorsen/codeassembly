import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingFile } from '../lib/type-guards.ts';
import type { SizeSnapshot } from './types.ts';

/**
 * Snapshots kept when a prune runs. A deployment of a few hundred files states a line of tens of kilobytes, and
 * every reader loads the record whole, so the record is capped rather than left to grow for as long as the machine
 * deploys.
 */
export const RETAINED_SNAPSHOTS = 200;

/** Record size past which an append prunes, checked by a `stat` so that the ordinary append stays one write. */
const PRUNE_THRESHOLD_BYTES = 8 * 1_024 * 1_024;

/**
 * Appends one snapshot as a single JSON line to `recordPath`, creating the enclosing directories when absent, and
 * prunes the record to its most recent snapshots once it grows past the threshold.
 *
 * The append is a single `O_APPEND` write of one line, as the event log's is: Two syncs can run against one record at
 * once, and a lone write at this size interleaves whole lines rather than corrupting them. A prune rewrites the file
 * and forfeits that guarantee for the moment it runs, which can cost a concurrent appender its line. The record is
 * machine-local telemetry, and losing one line there is cheaper than an unbounded file that every reader loads whole.
 */
export async function appendSnapshot(recordPath: string, snapshot: SizeSnapshot): Promise<void> {
  await mkdir(path.dirname(recordPath), { recursive: true });
  await appendFile(recordPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
  if ((await readRecordSize(recordPath)) > PRUNE_THRESHOLD_BYTES) {
    await pruneRecord(recordPath);
  }
}

/** Rewrites the record with its most recent lines alone, dropping the older ones. */
export async function pruneRecord(recordPath: string): Promise<void> {
  const raw = await readFile(recordPath, 'utf8');
  const lines = raw.split('\n').filter((line) => line.trim() !== '');
  await writeFile(recordPath, `${lines.slice(-RETAINED_SNAPSHOTS).join('\n')}\n`, 'utf8');
}

// region | Helpers

/** Reads the record's size in bytes, or zero when it is not there for the prune check to act on. */
async function readRecordSize(recordPath: string): Promise<number> {
  try {
    return (await stat(recordPath)).size;
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return 0;
    }
    throw error;
  }
}

// endregion | Helpers

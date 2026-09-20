import { readFile } from 'node:fs/promises';

import { isMissingFile } from '../lib/type-guards.ts';
import { parseReviewMarkerLine, parseSnapshotLine } from './schema.ts';
import type { ReviewMarker, SizeSnapshot } from './types.ts';

/**
 * Finds the snapshot standing at or before `instant`, or `undefined` when the record holds none. A marker older than
 * every surviving snapshot therefore resolves to no baseline, which is the case a pruned record leaves behind.
 *
 * The scan runs backward and stops at the first match, because the record's lines are in the order that they were
 * appended.
 */
export function findSnapshotAtOrBefore(lines: ReadonlyArray<string>, instant: string): SizeSnapshot | undefined {
  const limit = Date.parse(instant);
  if (Number.isNaN(limit)) {
    return undefined;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const snapshot = parseLine(lines[i], parseSnapshotLine);
    const recordedAt = snapshot === undefined ? NaN : Date.parse(snapshot.recordedAt);
    if (!Number.isNaN(recordedAt) && recordedAt <= limit) {
      return snapshot;
    }
  }
  return undefined;
}

/** The review markers that the record holds, in the order that it holds them. */
export function listReviewMarkers(lines: ReadonlyArray<string>): ReadonlyArray<ReviewMarker> {
  const markers: Array<ReviewMarker> = [];
  for (const line of lines) {
    const marker = parseLine(line, parseReviewMarkerLine);
    if (marker !== undefined) {
      markers.push(marker);
    }
  }
  return markers;
}

/**
 * Reads the non-empty lines of the record at `recordPath`, or none when the file is absent.
 *
 * The lines are returned unparsed so that one caller reads the file once and each question it asks parses only what
 * it keeps: A record at the prune threshold would otherwise leave every snapshot it holds parsed in memory.
 */
export async function readRecordLines(recordPath: string): Promise<ReadonlyArray<string>> {
  let raw: string;
  try {
    raw = await readFile(recordPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  return raw.split('\n').filter((line) => line.trim() !== '');
}

/**
 * Selects the latest snapshot the lines hold, or `undefined` when they hold none.
 *
 * The scan runs backward and returns the last line that parses, which skips a line of another kind and a final line
 * left truncated by an interrupted append alike.
 */
export function selectLatestSnapshot(lines: ReadonlyArray<string>): SizeSnapshot | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const snapshot = parseLine(lines[i], parseSnapshotLine);
    if (snapshot !== undefined) {
      return snapshot;
    }
  }
  return undefined;
}

// region | Helpers

/** Parses one line with the given parser, treating an absent line as one that does not parse. */
function parseLine<T>(line: string | undefined, parse: (line: string) => T | undefined): T | undefined {
  return line === undefined ? undefined : parse(line.trim());
}

// endregion | Helpers

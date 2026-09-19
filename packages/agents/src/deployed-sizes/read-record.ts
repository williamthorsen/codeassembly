import { readFile } from 'node:fs/promises';

import { isMissingFile } from '../lib/type-guards.ts';
import { parseSnapshotLine } from './schema.ts';
import type { SizeSnapshot } from './types.ts';

/**
 * Reads the latest snapshot from the record at `recordPath`, or `undefined` when it holds none: The file is absent,
 * or no line in it parses as a snapshot.
 *
 * The scan runs backward and returns the last line that parses, which skips a line of another kind and a final line
 * left truncated by an interrupted append alike.
 */
export async function readLatestSnapshot(recordPath: string): Promise<SizeSnapshot | undefined> {
  let raw: string;
  try {
    raw = await readFile(recordPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (line === undefined || line === '') {
      continue;
    }
    const snapshot = parseSnapshotLine(line);
    if (snapshot !== undefined) {
      return snapshot;
    }
  }
  return undefined;
}

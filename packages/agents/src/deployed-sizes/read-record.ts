import { readFile } from 'node:fs/promises';

import { isMissingFile } from '../lib/type-guards.ts';
import { parseSnapshotLine } from './schema.ts';
import type { SizeSnapshot } from './types.ts';

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

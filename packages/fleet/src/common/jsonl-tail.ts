// Incremental reader for append-only JSONL files. Knows nothing about lifecycle events: it turns "bytes past an
// offset" into complete lines, and reports the anomalies a concurrently written file can present — a torn trailing
// line, truncation, a vanished file — as data rather than exceptions, leaving the policy to the caller.

import { closeSync, openSync, readSync, statSync } from 'node:fs';

const NEWLINE_BYTE = 0x0a;

/**
 * Outcome of one tail read. `appended` carries the complete non-blank lines past the requested offset and the offset
 * to resume from; a torn trailing line (no newline yet) stays unconsumed, so the next read picks it up whole.
 */
export type TailResult =
  { kind: 'appended'; lines: string[]; offset: number } | { kind: 'missing' } | { kind: 'truncated'; size: number };

/**
 * Reads the complete lines appended to `filePath` past byte `offset`. Returns `missing` when the file is gone and
 * `truncated` when it shrank below the offset — both normal conditions for a file another process owns.
 */
export function readAppendedLines(input: { filePath: string; offset: number }): TailResult {
  let size: number;
  let fd: number;
  try {
    size = statSync(input.filePath).size;
    if (size < input.offset) {
      return { kind: 'truncated', size };
    }
    if (size === input.offset) {
      return { kind: 'appended', lines: [], offset: input.offset };
    }
    fd = openSync(input.filePath, 'r');
  } catch (error) {
    // The file can vanish between the caller's directory scan and this read.
    if (isMissingFileError(error)) {
      return { kind: 'missing' };
    }
    throw error;
  }

  const buffer = Buffer.alloc(size - input.offset);
  let bytesRead: number;
  try {
    bytesRead = readSync(fd, buffer, 0, buffer.length, input.offset);
  } finally {
    closeSync(fd);
  }

  const chunk = buffer.subarray(0, bytesRead);
  const lastNewline = chunk.lastIndexOf(NEWLINE_BYTE);
  if (lastNewline === -1) {
    return { kind: 'appended', lines: [], offset: input.offset };
  }

  const complete = chunk.subarray(0, lastNewline + 1);
  const lines = complete
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  // Advance by byte length, not string length, so multi-byte UTF-8 stays aligned.
  return { kind: 'appended', lines, offset: input.offset + complete.length };
}

// region | Helpers

/** True when `error` is a filesystem error reporting a path that does not exist. */
function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

// endregion | Helpers

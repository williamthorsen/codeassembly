import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { SizeSnapshot } from './types.ts';

/**
 * Appends one snapshot as a single JSON line to `recordPath`, creating the enclosing directories when absent.
 *
 * The append stays a single `O_APPEND` write of one line, as the event log's does: Two syncs can run against one
 * record at once, and a lone write at this size interleaves whole lines rather than corrupting them.
 */
export async function appendSnapshot(recordPath: string, snapshot: SizeSnapshot): Promise<void> {
  await mkdir(path.dirname(recordPath), { recursive: true });
  await appendFile(recordPath, `${JSON.stringify(snapshot)}\n`, 'utf8');
}

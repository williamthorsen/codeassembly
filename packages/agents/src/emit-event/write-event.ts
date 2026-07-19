import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { EventEnvelope } from '@codeassembly/lifecycle';

/**
 * Appends one envelope as a single JSON line to `filePath`, creating the enclosing directories when absent.
 *
 * The append must stay a single `O_APPEND` write of one line. Several agent sessions can emit to the same file
 * concurrently — one branch, several sessions is the ordinary case — and a lone write at this size is atomic against
 * other appenders on a local filesystem, so concurrent emitters interleave whole lines instead of corrupting each
 * other. Batching several events into one call, or letting a payload grow a line past the pipe-buffer bound, forfeits
 * that guarantee.
 */
export async function appendEvent(input: { filePath: string; envelope: EventEnvelope }): Promise<void> {
  await mkdir(path.dirname(input.filePath), { recursive: true });
  await appendFile(input.filePath, `${JSON.stringify(input.envelope)}\n`, 'utf8');
}

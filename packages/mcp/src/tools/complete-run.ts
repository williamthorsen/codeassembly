import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { emitEvent } from './emit-event.ts';

/** Allowed completion statuses (excludes `in_progress`). */
const completionStatusSchema = z.enum(['completed', 'failed', 'needs_manual_review']);

export type CompletionStatus = z.infer<typeof completionStatusSchema>;

export interface CompleteRunInput {
  runDir: string;
  status: string;
  reason?: string | undefined;
}

export interface CompleteRunResult {
  success: boolean;
  error?: string | undefined;
}

/**
 * Complete a run: emit a `run_completed` or `run_failed` event (based on the
 * status) and stamp `completedAt` on the run-index.json header for fast
 * discovery without reading the JSONL log.
 *
 * When `status` is `'failed'`, a `run_failed` event is emitted instead of
 * `run_completed`. The optional `reason` field is included in the `run_failed`
 * event; it is ignored for other statuses.
 */
export async function completeRun(input: CompleteRunInput): Promise<CompleteRunResult> {
  const { runDir, status, reason } = input;

  const statusResult = completionStatusSchema.safeParse(status);
  if (!statusResult.success) {
    return {
      success: false,
      error: `Invalid status "${status}": must be one of completed, failed, needs_manual_review`,
    };
  }

  const validStatus = statusResult.data;

  // Capture timestamp once so the event and the index header are consistent
  const now = new Date().toISOString();

  // Emit run_failed for failed status, run_completed otherwise
  const event =
    validStatus === 'failed'
      ? { event: 'run_failed', status: validStatus, reason }
      : { event: 'run_completed', status: validStatus };

  const emitResult = await emitEvent({
    runDir,
    event,
    timestamp: now,
  });

  if (!emitResult.success) {
    return emitResult;
  }

  // Stamp completedAt on run-index.json
  const indexPath = join(runDir, 'run-index.json');
  const raw = await readFile(indexPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return { success: false, error: 'run-index.json is not a valid JSON object' };
  }

  const updated = { ...parsed, completedAt: now };
  await writeFile(indexPath, JSON.stringify(updated, null, 2) + '\n');

  return { success: true };
}

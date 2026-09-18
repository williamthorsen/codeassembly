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
 * Completes a run: emits a `run_failed` event when `status` is `'failed'` and a
 * `run_completed` event otherwise, then stamps `completedAt` on the
 * run-index.json header for fast discovery without reading the JSONL log.
 *
 * `reason` is included in the `run_failed` event and ignored for other
 * statuses.
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

  // Capture timestamp once so that the event and the index header are consistent
  const now = new Date().toISOString();

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

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runEventSchema } from 'codeassembly-run-core';

export interface EmitEventInput {
  runDir: string;
  event: unknown;
  /** Optional server-side timestamp override. When provided, this value is
   *  used instead of generating a new `Date`. Useful for coordinating a single
   *  timestamp across multiple writes (e.g. event log + index header). */
  timestamp?: string;
}

export interface EmitEventResult {
  success: boolean;
  error?: string | undefined;
}

/**
 * Validate and append a run event to the JSONL log.
 *
 * Injects a server-side timestamp (`t`) before validation to ensure
 * monotonicity and avoid client-provided timestamps.
 */
export async function emitEvent(input: EmitEventInput): Promise<EmitEventResult> {
  const { runDir, event, timestamp } = input;

  // Inject server-side timestamp, using the provided override or generating one
  const t = timestamp ?? new Date().toISOString();
  const timestamped = typeof event === 'object' && event !== null ? { ...event, t } : event;

  const result = runEventSchema.safeParse(timestamped);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    return { success: false, error: `Event validation failed: ${issues.join('; ')}` };
  }

  const logPath = join(runDir, 'run-log.jsonl');
  try {
    await appendFile(logPath, JSON.stringify(result.data) + '\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to write event to ${logPath}: ${message}` };
  }
  return { success: true };
}

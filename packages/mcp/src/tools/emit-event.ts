import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';
import { runEventSchema } from 'codeassembly-run-core';

export interface EmitEventInput {
  runDir: string;
  event: unknown;
  /**
   * Overrides the generated server-side timestamp, so that a caller can stamp several writes, such as the event log
   * and the index header, with one value.
   */
  timestamp?: string;
}

export interface EmitEventResult {
  success: boolean;
  error?: string | undefined;
}

/**
 * Validates and appends a run event to the JSONL log.
 *
 * Injects a server-side timestamp (`t`) before validation to ensure
 * monotonicity and avoid client-provided timestamps.
 */
export async function emitEvent(input: EmitEventInput): Promise<EmitEventResult> {
  const { runDir, event, timestamp } = input;

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
    const message = describeError(error);
    return { success: false, error: `Failed to write event to ${logPath}: ${message}` };
  }
  return { success: true };
}

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runEventSchema } from '@codeassembly/run-core';

export interface EmitEventInput {
  runDir: string;
  event: unknown;
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
  const { runDir, event } = input;

  // Inject timestamp if the event is an object
  const timestamped = typeof event === 'object' && event !== null ? { ...event, t: new Date().toISOString() } : event;

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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  type CanonicalRunStatus,
  foldEvents,
  parseRunLogLine,
  type RunEvent,
  type RunHeader,
  v3RunIndexSchema,
} from 'codeassembly-run-core';

export interface GetRunStateInput {
  runDir: string;
}

/**
 * Reads run-index.json and run-log.jsonl, parses the events, and folds them
 * into a `CanonicalRunStatus`. Throws when run-index.json is not a valid v3
 * index.
 *
 * A log line that fails to parse is skipped. A line that is not valid JSON is
 * logged to `console.error` as file corruption; a line that fails schema
 * validation is logged to `console.warn`, so that an event type written by a
 * newer emitter does not fail the read.
 */
export async function getRunState(input: GetRunStateInput): Promise<CanonicalRunStatus> {
  const { runDir } = input;

  const indexPath = join(runDir, 'run-index.json');
  const indexContent = await readFile(indexPath, 'utf8');
  const rawIndex: unknown = JSON.parse(indexContent);

  const v3Result = v3RunIndexSchema.safeParse(rawIndex);
  if (!v3Result.success) {
    throw new Error(`Invalid run-index.json at ${indexPath}: ${v3Result.error.message}`);
  }

  const v3Data = v3Result.data;

  const header: RunHeader = {
    runId: v3Data.context.runId,
    projectSlug: v3Data.context.projectSlug,
    ticketId: v3Data.context.ticketId,
    projectRoot: v3Data.context.projectRoot,
    branch: v3Data.context.branch,
    task: v3Data.context.task,
    startedAt: v3Data.context.startedAt,
    externalPlan: v3Data.config.externalPlan,
    mergeBaseSha: v3Data.config.mergeBaseSha,
    diffBase: v3Data.config.diffBase,
    maxReviewRounds: v3Data.config.maxReviewRounds,
    effort: v3Data.config.effort,
    approvalThreshold: v3Data.config.approvalThreshold,
    budgetThreshold: v3Data.config.budgetThreshold,
    mode: v3Data.config.mode,
    model: v3Data.config.model,
  };

  const logPath = join(runDir, 'run-log.jsonl');
  const logContent = await readFile(logPath, 'utf8');

  const events: RunEvent[] = [];
  const lines = logContent.split('\n').filter((line) => line.trim() !== '');

  for (const [i, line] of lines.entries()) {
    try {
      events.push(parseRunLogLine(line));
    } catch (error) {
      if (error instanceof SyntaxError) {
        // JSON.parse failed -- indicates file corruption
        console.error(
          `[mcp/get-run-state] corrupt JSON at line index ${String(i)} in ${logPath} (possible file corruption):`,
          error,
        );
      } else {
        // Schema validation failed -- likely an unrecognized event type (forward-compat)
        console.warn(`[mcp/get-run-state] skipped unrecognized event at line index ${String(i)} in ${logPath}:`, error);
      }
    }
  }

  return foldEvents(header, events);
}

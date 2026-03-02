import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { emitEvent } from './emit-event.js';

export interface InitRunInput {
  projectSlug: string;
  ticketId?: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  pipeline?: unknown;
  models?: unknown;
  config?: Record<string, unknown> | undefined;
}

export interface InitRunResult {
  runDir: string;
  runId: string;
  ticketId: string;
  timestamp: string;
}

/** Generate a run ID in the format `{projectSlug}.{yyyymmdd}-{hhmmss}Z`. */
function generateRunId(projectSlug: string): string {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replace(/-/g, '');
  const time = iso.slice(11, 19).replace(/:/g, '');
  return `${projectSlug}.${date}-${time}Z`;
}

/** Generate a ticket ID in the format `{YYYYMMDD}-{4 random hex}`. */
function generateTicketId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(2).toString('hex');
  return `${date}-${suffix}`;
}

/**
 * Initialize a new run: create the run directory, write run-index.json, create
 * an empty run-log.jsonl, and emit a `run_started` event.
 *
 * Runs are stored at `{projectRoot}/.ai/runs/{ticketId}/{runId}/`. When no
 * ticket ID is provided, one is auto-generated with a timestamp-based format.
 */
export async function initRun(input: InitRunInput): Promise<InitRunResult> {
  const { projectSlug, projectRoot, branch, task, pipeline, models, config } = input;

  const resolvedTicketId = input.ticketId ?? generateTicketId();
  const runId = generateRunId(projectSlug);
  const timestamp = new Date().toISOString();
  const runDir = join(projectRoot, '.ai', 'runs', resolvedTicketId, runId);

  await mkdir(runDir, { recursive: true });

  const runIndex = {
    version: 3,
    context: {
      runId,
      projectSlug,
      ticketId: resolvedTicketId,
      projectRoot,
      branch,
      task,
      startedAt: timestamp,
    },
    config: {
      ...config,
      ...(pipeline === undefined ? {} : { pipeline }),
      ...(models === undefined ? {} : { models }),
    },
  };

  await writeFile(join(runDir, 'run-index.json'), JSON.stringify(runIndex, null, 2) + '\n');
  await writeFile(join(runDir, 'run-log.jsonl'), '');

  // Emit a run_started event
  const emitResult = await emitEvent({
    runDir,
    event: { event: 'run_started' },
  });

  if (!emitResult.success) {
    throw new Error(`Failed to emit run_started event: ${emitResult.error ?? 'unknown error'}`);
  }

  return { runDir, runId, ticketId: resolvedTicketId, timestamp };
}

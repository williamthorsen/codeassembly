import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveBaseDir } from '@codeassembly/run-core/config';

import { emitEvent } from './emit-event.ts';

export interface InitRunInput {
  projectSlug: string;
  ticketId?: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  pipeline?: unknown;
  models?: unknown;
  config?: Record<string, unknown> | undefined;
  baseDir?: string | undefined;
}

export interface InitRunResult {
  runDir: string;
  runId: string;
  ticketId: string;
  timestamp: string;
}

/** Generate a run ID in the format `{yyyymmdd}-{hhmmss}Z`. */
function generateRunId(): string {
  const iso = new Date().toISOString();
  const date = iso.slice(0, 10).replace(/-/g, '');
  const time = iso.slice(11, 19).replace(/:/g, '');
  return `${date}-${time}Z`;
}

/** Generate a ticket ID in the format `{YYYYMMDD}-{4 random hex}`. */
function generateTicketId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(2).toString('hex');
  return `${date}-${suffix}`;
}

/**
 * Sanitize a caller-supplied ticket ID for use in file paths.
 * Strips leading `#` characters (a display convention, not part of the identifier).
 * Throws if the result is empty.
 */
export function sanitizeTicketId(ticketId: string): string {
  const sanitized = ticketId.replace(/^#+/, '');
  if (sanitized === '') {
    throw new Error(`Invalid ticket ID: "${ticketId}" reduces to empty string after sanitization`);
  }
  return sanitized;
}

/**
 * Initialize a new run: create the run directory, write run-index.json, create
 * an empty run-log.jsonl, and emit a `run_started` event.
 *
 * The artifact base directory is resolved from preferences (defaulting to `~/.ai`)
 * with an optional `baseDir` override. Runs are stored at
 * `{artifactBase}/projects/{projectSlug}/tickets/{ticketId}/{runId}/`.
 * When no ticket ID is provided, one is auto-generated with a timestamp-based format.
 * Caller-supplied ticket IDs are sanitized (leading `#` stripped) before use.
 */
export async function initRun(input: InitRunInput): Promise<InitRunResult> {
  const { ticketId, projectSlug, projectRoot, branch, task, pipeline, models, config, baseDir } = input;

  const resolvedTicketId = ticketId === undefined ? generateTicketId() : sanitizeTicketId(ticketId);
  const runId = generateRunId();
  const timestamp = new Date().toISOString();
  const artifactBase = await resolveBaseDir(projectRoot, baseDir);
  const runDir = join(artifactBase, 'projects', projectSlug, 'tickets', resolvedTicketId, runId);

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
      ...(pipeline !== undefined && { pipeline }),
      ...(models !== undefined && { models }),
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

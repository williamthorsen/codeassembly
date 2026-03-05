import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { foldEvents } from '../event-folder.js';
import { RunDataParseError } from '../run-data-parse-error.js';
import { v2RunIndexSchema } from '../schemas/run-index-schema.js';
import { parseRunLogLine, v3RunIndexSchema } from '../schemas/run-log-schema.js';
import { v1StatusSchema } from '../schemas/status-json-schema.js';
import type { ArtifactEntry, CanonicalRunStatus, PhaseDecision, Phases, RunStatus } from '../types/canonical.js';
import type { RunEvent, RunHeader } from '../types/run-log.js';

/** Check whether an error is an ENOENT filesystem error. */
function isEnoent(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Try v3 (header + log) first, then v2 (run-index.json), fall back to v1 (status.json). */
export async function parseRunData(runPath: string): Promise<CanonicalRunStatus> {
  const indexPath = join(runPath, 'run-index.json');
  let indexContent: string;

  try {
    indexContent = await readFile(indexPath, 'utf8');
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
    // run-index.json missing — fall back to v1
    const v1Path = join(runPath, 'status.json');
    return parseStatusFile(v1Path);
  }

  // Parse the JSON (corrupt JSON propagates, no fallback)
  let raw: unknown;
  try {
    raw = JSON.parse(indexContent);
  } catch (error) {
    const message = `Failed to parse JSON at ${indexPath}: ${String(error)}`;
    throw new RunDataParseError(message, 'corrupt_json', indexPath);
  }

  // Try v3 first
  const v3Result = v3RunIndexSchema.safeParse(raw);
  if (v3Result.success) {
    const logPath = join(runPath, 'run-log.jsonl');
    let logContent: string;
    try {
      logContent = await readFile(logPath, 'utf8');
    } catch (error) {
      if (!isEnoent(error)) {
        throw error;
      }
      const message = `v3 run-index.json found at ${indexPath} but run-log.jsonl is missing`;
      throw new RunDataParseError(message, 'missing_companion', indexPath);
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
      fixLowFindings: v3Data.config.fixLowFindings,
      mode: v3Data.config.mode,
      model: v3Data.config.model,
    };

    const events: RunEvent[] = [];
    const lines = logContent.split('\n').filter((line) => line.trim() !== '');
    for (const [i, line] of lines.entries()) {
      try {
        events.push(parseRunLogLine(line));
      } catch (error) {
        if (error instanceof SyntaxError) {
          // JSON.parse failed — indicates file corruption, not a forward-compat scenario
          console.error(
            `[run-data-parser] corrupt JSON at line index ${String(i)} in ${logPath} (possible file corruption):`,
            error,
          );
        } else {
          // Schema validation failed — likely an unrecognized event type (forward-compat)
          console.warn(`[run-data-parser] skipped unrecognized event at line index ${String(i)} in ${logPath}:`, error);
        }
      }
    }

    return foldEvents(header, events);
  }

  // Try v2
  assertValidRunIndex(raw, indexPath);
  return normalizeV2(raw);
}

export async function parseStatusFile(filePath: string): Promise<CanonicalRunStatus> {
  const content = await readFile(filePath, 'utf8');
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    const message = `Failed to parse JSON at ${filePath}: ${String(error)}`;
    throw new RunDataParseError(message, 'corrupt_json', filePath);
  }

  assertValidStatusObject(raw, filePath);
  return normalizeV1(raw);
}

// -- v1 types and normalization ----------------------------------------------

interface V1StatusObject {
  runId: string;
  projectSlug: string;
  ticketId: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  startedAt: string;
  completedAt: string | null | undefined;
  status: RunStatus;
  externalPlan: boolean | undefined;
  mergeBaseSha: string | undefined;
  diffBase: string | undefined;
  maxReviewRounds: number | undefined;
  fixLowFindings: boolean | undefined;
  phases: Phases;
  phaseDecision: Record<string, PhaseDecision> | undefined;
}

function normalizeV1(raw: V1StatusObject): CanonicalRunStatus {
  const { phaseDecision, completedAt, ...rest } = raw;
  return {
    ...rest,
    completedAt: completedAt ?? undefined,
    reason: undefined,
    mode: undefined,
    model: undefined,
    phaseDecisions: phaseDecision,
    artifacts: undefined,
  };
}

// -- v2 types and normalization ----------------------------------------------

interface V2RunIndex {
  version: 2;
  context: V2Context;
  config: V2Config;
  artifacts: ArtifactEntry[] | undefined;
}

interface V2Context {
  runId: string;
  projectSlug: string;
  ticketId: string | undefined;
  projectRoot: string;
  branch: string;
  task: string;
  startedAt: string;
  completedAt: string | null | undefined;
  status: RunStatus;
  phases: Phases;
  phaseDecisions: Record<string, PhaseDecision> | undefined;
}

interface V2Config {
  externalPlan: boolean | undefined;
  mergeBaseSha: string | undefined;
  diffBase: string | undefined;
  maxReviewRounds: number | undefined;
  fixLowFindings: boolean | undefined;
  mode: string | undefined;
  model: string | undefined;
}

function normalizeV2(raw: V2RunIndex): CanonicalRunStatus {
  const { context, config } = raw;

  return {
    runId: context.runId,
    projectSlug: context.projectSlug,
    ticketId: context.ticketId,
    projectRoot: context.projectRoot,
    branch: context.branch,
    task: context.task,
    startedAt: context.startedAt,
    completedAt: context.completedAt ?? undefined,
    status: context.status,
    reason: undefined,
    externalPlan: config.externalPlan,
    mergeBaseSha: config.mergeBaseSha,
    diffBase: config.diffBase,
    maxReviewRounds: config.maxReviewRounds,
    fixLowFindings: config.fixLowFindings,
    mode: config.mode,
    model: config.model,
    phases: context.phases,
    phaseDecisions: context.phaseDecisions,
    artifacts: raw.artifacts,
  };
}

// -- validation via Zod schemas with issue capture ---------------------------

function assertValidRunIndex(raw: unknown, filePath: string): asserts raw is V2RunIndex {
  const result = v2RunIndexSchema.safeParse(raw);
  if (!result.success) {
    const message = `Invalid run-index.json at ${filePath}`;
    throw new RunDataParseError(message, 'invalid_schema', filePath, result.error.issues);
  }
}

function assertValidStatusObject(raw: unknown, filePath: string): asserts raw is V1StatusObject {
  const result = v1StatusSchema.safeParse(raw);
  if (!result.success) {
    const message = `Invalid status.json at ${filePath}`;
    throw new RunDataParseError(message, 'invalid_schema', filePath, result.error.issues);
  }
}

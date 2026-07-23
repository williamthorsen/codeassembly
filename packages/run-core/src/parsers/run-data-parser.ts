import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { foldEvents } from '../event-folder.ts';
import { RunDataParseError } from '../run-data-parse-error.ts';
import { v2RunIndexSchema } from '../schemas/run-index-schema.ts';
import { parseRunLogLine, v3RunIndexSchema } from '../schemas/run-log-schema.ts';
import { v1StatusSchema } from '../schemas/status-json-schema.ts';
import { isEnoent } from '../type-guards.ts';
import type { ArtifactEntry, CanonicalRunStatus, PhaseDecision, Phases, RunStatus } from '../types/canonical.ts';
import type { RunEvent, RunHeader } from '../types/run-log.ts';

/** Read and parse a v3 run's raw header + events without folding into a final snapshot. */
export async function parseRunRawData(runPath: string): Promise<{ header: RunHeader; events: RunEvent[] }> {
  const indexPath = join(runPath, 'run-index.json');
  let indexContent: string;

  try {
    indexContent = await readFile(indexPath, 'utf8');
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
    const message = `Run at ${runPath} does not have a v3 event log`;
    throw new RunDataParseError(message, 'no_event_log', runPath);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(indexContent);
  } catch (error) {
    const message = `Failed to parse JSON at ${indexPath}: ${String(error)}`;
    throw new RunDataParseError(message, 'corrupt_json', indexPath);
  }

  const v3Result = v3RunIndexSchema.safeParse(raw);
  if (!v3Result.success) {
    const message = `Run at ${runPath} does not have a v3 event log`;
    throw new RunDataParseError(message, 'no_event_log', runPath);
  }

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

  const header = extractHeader(v3Result.data);
  const events = parseLogLines(logContent, logPath);

  return { header, events };
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

    const header = extractHeader(v3Result.data);
    const events = parseLogLines(logContent, logPath);

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

// region | v1 types and normalization

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
  phases: Phases;
  phaseDecision: Record<string, PhaseDecision> | undefined;
}

function normalizeV1(raw: V1StatusObject): CanonicalRunStatus {
  const { phaseDecision, completedAt, ...rest } = raw;
  return {
    ...rest,
    completedAt: completedAt ?? undefined,
    reason: undefined,
    waitingForInput: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
    mode: undefined,
    model: undefined,
    phaseDecisions: phaseDecision,
    artifacts: undefined,
  };
}

// endregion | v1 types and normalization

// region | v2 types and normalization

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
  effort: string | undefined;
  approvalThreshold: string | undefined;
  budgetThreshold: string | undefined;
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
    waitingForInput: undefined,
    externalPlan: config.externalPlan,
    mergeBaseSha: config.mergeBaseSha,
    diffBase: config.diffBase,
    maxReviewRounds: config.maxReviewRounds,
    effort: config.effort,
    approvalThreshold: config.approvalThreshold,
    budgetThreshold: config.budgetThreshold,
    mode: config.mode,
    model: config.model,
    phases: context.phases,
    phaseDecisions: context.phaseDecisions,
    artifacts: raw.artifacts,
  };
}

// endregion | v2 types and normalization

// region | v3 helpers

interface V3ParsedData {
  context: {
    runId: string;
    projectSlug: string;
    ticketId?: string | undefined;
    projectRoot: string;
    branch: string;
    task: string;
    startedAt: string;
  };
  config: {
    externalPlan?: boolean | undefined;
    mergeBaseSha?: string | undefined;
    diffBase?: string | undefined;
    maxReviewRounds?: number | undefined;
    effort?: string | undefined;
    approvalThreshold?: string | undefined;
    budgetThreshold?: string | undefined;
    mode?: string | undefined;
    model?: string | undefined;
  };
}

/** Extract a `RunHeader` from parsed v3 run-index.json data. */
function extractHeader(v3Data: V3ParsedData): RunHeader {
  return {
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
}

/** Parse JSONL content into run events, skipping corrupt or unrecognized lines. */
function parseLogLines(logContent: string, logPath: string): RunEvent[] {
  const events: RunEvent[] = [];
  const lines = logContent.split('\n').filter((line) => line.trim() !== '');
  for (const [i, line] of lines.entries()) {
    try {
      events.push(parseRunLogLine(line));
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error(
          `[run-data-parser] corrupt JSON at line index ${String(i)} in ${logPath} (possible file corruption):`,
          error,
        );
      } else {
        console.warn(`[run-data-parser] skipped unrecognized event at line index ${String(i)} in ${logPath}:`, error);
      }
    }
  }
  return events;
}

// endregion | v3 helpers

// -- validation via Zod schemas with issue capture --

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

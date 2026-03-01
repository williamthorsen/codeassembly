import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { foldEvents } from '../event-folder.js';
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
  const raw: unknown = JSON.parse(indexContent);

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
      // run-log.jsonl missing — fall back to v2 path
      return parseRunIndexFromRaw(raw, indexPath);
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
        // Forward-compat: skip unrecognized event types and malformed lines, but log for observability
        console.warn(`[run-data-parser] skipped unparseable log line at index ${String(i)}:`, error);
      }
    }

    return foldEvents(header, events);
  }

  // Try v2
  return parseRunIndexFromRaw(raw, indexPath);
}

export async function parseStatusFile(filePath: string): Promise<CanonicalRunStatus> {
  const content = await readFile(filePath, 'utf8');
  const raw: unknown = JSON.parse(content);

  if (!isValidStatusObject(raw)) {
    throw new Error(`Invalid status.json at ${filePath}`);
  }

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

function parseRunIndexFromRaw(raw: unknown, filePath: string): CanonicalRunStatus {
  if (!isValidRunIndex(raw)) {
    throw new Error(`Invalid run-index.json at ${filePath}`);
  }

  return normalizeV2(raw);
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

// -- validation via Zod schemas ----------------------------------------------

function isValidRunIndex(raw: unknown): raw is V2RunIndex {
  return v2RunIndexSchema.safeParse(raw).success;
}

function isValidStatusObject(raw: unknown): raw is V1StatusObject {
  return v1StatusSchema.safeParse(raw).success;
}

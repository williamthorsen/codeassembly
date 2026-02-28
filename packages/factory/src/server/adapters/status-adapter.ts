import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ArtifactEntry,
  CanonicalRunStatus,
  PhaseDecision,
  Phases,
  RunStatus,
} from '../../shared/types/canonical.js';
import { isEnoent } from '../type-guards.js';
import { v2RunIndexSchema } from './schemas/run-index-schema.js';
import { v1StatusSchema } from './schemas/status-json-schema.js';

/** Try v2 (run-index.json) first, fall back to v1 (status.json). */
export async function parseRunData(runPath: string): Promise<CanonicalRunStatus> {
  const v2Path = join(runPath, 'run-index.json');
  try {
    return await parseRunIndex(v2Path);
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }

  const v1Path = join(runPath, 'status.json');
  return parseStatusFile(v1Path);
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

async function parseRunIndex(filePath: string): Promise<CanonicalRunStatus> {
  const content = await readFile(filePath, 'utf8');
  const raw: unknown = JSON.parse(content);

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

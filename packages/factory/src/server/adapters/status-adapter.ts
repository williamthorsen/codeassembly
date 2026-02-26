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

const VALID_RUN_STATUSES = new Set(['in_progress', 'completed', 'failed', 'needs_manual_review']);
const VALID_PHASE_STATUSES = new Set(['completed', 'skipped', 'failed', 'in_progress', 'approved']);
const VALID_CRITICALITIES = new Set(['none', 'low', 'medium', 'high']);

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
  completedAt: string | undefined;
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
  const { phaseDecision, ...rest } = raw;
  return {
    ...rest,
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

// -- v2 validation -----------------------------------------------------------

function isValidRunIndex(raw: unknown): raw is V2RunIndex {
  if (!isRecord(raw)) return false;
  if (raw.version !== 2) return false;
  if (!isRecord(raw.context) || !isValidContext(raw.context)) return false;
  if (!isRecord(raw.config) || !isValidConfig(raw.config)) return false;
  if (!isValidArtifactsArray(raw.artifacts)) return false;
  return true;
}

function isValidContext(context: Record<string, unknown>): boolean {
  if (!hasValidRequiredFields(context)) return false;
  if (!isOptionalString(context.ticketId)) return false;
  if (!isOptionalNullableString(context.completedAt)) return false;
  if (!isValidPhasesObject(context.phases)) return false;
  if (!isValidPhaseDecisionMap(context.phaseDecisions)) return false;
  return true;
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isValidConfig(config: Record<string, unknown>): boolean {
  if (!isOptionalBoolean(config.externalPlan)) return false;
  if (!isOptionalString(config.mergeBaseSha)) return false;
  if (!isOptionalString(config.diffBase)) return false;
  if (!isOptionalNumber(config.maxReviewRounds)) return false;
  if (!isOptionalBoolean(config.fixLowFindings)) return false;
  if (!isOptionalString(config.mode)) return false;
  if (!isOptionalString(config.model)) return false;
  return true;
}

function isValidArtifactsArray(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  for (const entry of value) {
    if (!isValidArtifactEntry(entry)) return false;
  }
  return true;
}

function isValidArtifactEntry(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!hasValidArtifactRequiredFields(value)) return false;
  if (!isOptionalNumber(value.iteration)) return false;
  if (!isOptionalString(value.note)) return false;
  return true;
}

function hasValidArtifactRequiredFields(entry: Record<string, unknown>): boolean {
  if (typeof entry.filename !== 'string') return false;
  if (typeof entry.role !== 'string') return false;
  if (typeof entry.roleType !== 'string') return false;
  if (typeof entry.agent !== 'string') return false;
  if (typeof entry.type !== 'string') return false;
  if (typeof entry.phase !== 'string') return false;
  if (typeof entry.createdAt !== 'string') return false;
  return true;
}

// -- shared validation helpers -----------------------------------------------

function hasValidRequiredFields(raw: Record<string, unknown>): boolean {
  if (typeof raw.runId !== 'string') return false;
  if (typeof raw.projectSlug !== 'string') return false;
  if (typeof raw.projectRoot !== 'string') return false;
  if (typeof raw.branch !== 'string') return false;
  if (typeof raw.task !== 'string') return false;
  if (typeof raw.startedAt !== 'string') return false;
  if (typeof raw.status !== 'string' || !VALID_RUN_STATUSES.has(raw.status)) return false;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || typeof value === 'number';
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function isValidPhaseStatus(value: unknown): boolean {
  return typeof value === 'string' && VALID_PHASE_STATUSES.has(value);
}

function isValidCriticality(value: unknown): boolean {
  return typeof value === 'string' && VALID_CRITICALITIES.has(value);
}

function isValidPhaseDecisionMap(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (!isRecord(entry)) return false;
    if (typeof entry.run !== 'boolean') return false;
    if (typeof entry.reason !== 'string') return false;
  }
  return true;
}

function isValidPhaseEntry(phase: unknown): boolean {
  if (!isRecord(phase)) {
    return false;
  }
  if ('status' in phase && !isValidPhaseStatus(phase.status)) {
    return false;
  }
  if ('criticality' in phase && !isValidCriticality(phase.criticality)) {
    return false;
  }
  if ('finalCriticality' in phase && !isValidCriticality(phase.finalCriticality)) {
    return false;
  }
  if ('aggregatedCriticality' in phase && !isValidCriticality(phase.aggregatedCriticality)) {
    return false;
  }
  return true;
}

function isValidPhasesObject(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  for (const phase of Object.values(value)) {
    if (phase === undefined) {
      continue;
    }
    if (!isValidPhaseEntry(phase)) {
      return false;
    }
  }
  return true;
}

// -- v1 validation -----------------------------------------------------------

function hasValidOptionalFields(raw: Record<string, unknown>): boolean {
  if (!isOptionalString(raw.ticketId)) return false;
  if (!isOptionalString(raw.completedAt)) return false;
  if (!isOptionalBoolean(raw.externalPlan)) return false;
  if (!isOptionalString(raw.mergeBaseSha)) return false;
  if (!isOptionalString(raw.diffBase)) return false;
  if (!isOptionalNumber(raw.maxReviewRounds)) return false;
  if (!isOptionalBoolean(raw.fixLowFindings)) return false;
  return true;
}

function isValidStatusObject(raw: unknown): raw is V1StatusObject {
  if (!isRecord(raw)) {
    return false;
  }

  if (!hasValidRequiredFields(raw)) return false;
  if (!hasValidOptionalFields(raw)) return false;
  if (!isValidPhasesObject(raw.phases)) return false;
  if (!isValidPhaseDecisionMap(raw.phaseDecision)) return false;

  return true;
}

import { readFile } from 'node:fs/promises';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

const VALID_RUN_STATUSES = new Set(['in_progress', 'completed', 'failed', 'needs_manual_review']);
const VALID_PHASE_STATUSES = new Set(['completed', 'skipped', 'failed', 'in_progress', 'approved']);
const VALID_CRITICALITIES = new Set(['none', 'low', 'medium', 'high']);

export async function parseStatusFile(filePath: string): Promise<CanonicalRunStatus> {
  const content = await readFile(filePath, 'utf8');
  const raw: unknown = JSON.parse(content);

  if (!isValidStatusObject(raw)) {
    throw new Error(`Invalid status.json at ${filePath}`);
  }

  return raw;
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

function isOptionalCriticality(value: unknown): boolean {
  return value === undefined || isValidCriticality(value);
}

function isValidPhaseDecisionMap(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  for (const key of Object.keys(value)) {
    const entry = value[key];
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
  // All phase types that have a status field must have a valid PhaseStatus
  if ('status' in phase && !isValidPhaseStatus(phase.status)) {
    return false;
  }
  // Validate criticality fields if present
  if ('criticality' in phase && !isOptionalCriticality(phase.criticality)) {
    return false;
  }
  if ('finalCriticality' in phase && !isOptionalCriticality(phase.finalCriticality)) {
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
  // Validate each present phase entry
  for (const key of Object.keys(value)) {
    const phase = value[key];
    if (phase === undefined || phase === null) {
      continue;
    }
    if (!isValidPhaseEntry(phase)) {
      return false;
    }
  }
  return true;
}

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

function isValidStatusObject(raw: unknown): raw is CanonicalRunStatus {
  if (!isRecord(raw)) {
    return false;
  }

  if (!hasValidRequiredFields(raw)) return false;
  if (!hasValidOptionalFields(raw)) return false;
  if (!isValidPhasesObject(raw.phases)) return false;
  if (!isValidPhaseDecisionMap(raw.phaseDecision)) return false;

  return true;
}

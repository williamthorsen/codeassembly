import { readFile } from 'node:fs/promises';

import type { CanonicalRunStatus } from '../../shared/types/canonical.js';

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

function isValidStatusObject(raw: unknown): raw is CanonicalRunStatus {
  if (!isRecord(raw)) {
    return false;
  }

  // Validate required string fields
  if (typeof raw.runId !== 'string') return false;
  if (typeof raw.projectSlug !== 'string') return false;
  if (typeof raw.projectRoot !== 'string') return false;
  if (typeof raw.branch !== 'string') return false;
  if (typeof raw.task !== 'string') return false;
  if (typeof raw.startedAt !== 'string') return false;
  if (typeof raw.status !== 'string') return false;

  // Phases object is required but can have undefined members
  if (!isRecord(raw.phases)) {
    return false;
  }

  return true;
}

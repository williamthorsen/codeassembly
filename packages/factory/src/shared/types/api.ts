import type { RunStatus } from './canonical.js';

export interface ProjectIndex {
  projects: ProjectInfo[];
}

export interface ProjectInfo {
  slug: string;
  tickets: TicketInfo[];
}

export interface TicketInfo {
  ticketId: string;
  runs: RunInfo[];
}

export interface RunInfo {
  runId: string;
  path: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | undefined;
}

export interface FlatRunInfo extends Omit<RunInfo, 'path'> {
  projectSlug: string;
  ticketId: string;
}

export interface ArtifactListResponse {
  artifacts: string[];
}

/** Dependency interface for route handlers that need to read the project index. */
export interface ProjectIndexProvider {
  getIndex(): ProjectIndex | null;
}

export { type ArtifactEntry, type CanonicalRunStatus } from './canonical.js';

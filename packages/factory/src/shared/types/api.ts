import type { RunEvent, RunHeader, RunStatus } from 'codeassembly-run-core';

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

export interface ArtifactContentResponse {
  content: string;
}

/** Dependency interface for route handlers that need to read the project index. */
export interface ProjectIndexProvider {
  getIndex(): ProjectIndex | null;
}

/** Response payload for the raw events endpoint. */
export interface RunEventsResponse {
  header: RunHeader;
  events: RunEvent[];
}

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
}

export interface ArtifactListResponse {
  artifacts: string[];
}

export interface ArtifactContentResponse {
  content: string;
}

export {type CanonicalRunStatus} from './canonical.js';

import type {
  ArtifactContentResponse,
  ArtifactListResponse,
  CanonicalRunStatus,
  ProjectIndex,
} from '../../shared/types/api.js';

const API_BASE = '/api';

async function fetchJson<T>(url: string, errorMessage: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${errorMessage}: ${response.statusText}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- response.json() returns Promise<any> from DOM lib
  return response.json();
}

export function fetchProjects(): Promise<ProjectIndex> {
  return fetchJson<ProjectIndex>(`${API_BASE}/projects`, 'Failed to fetch projects');
}

export function fetchRunStatus(projectSlug: string, runId: string): Promise<CanonicalRunStatus> {
  return fetchJson<CanonicalRunStatus>(`${API_BASE}/runs/${projectSlug}/${runId}`, 'Failed to fetch run status');
}

export async function fetchArtifacts(projectSlug: string, runId: string): Promise<string[]> {
  const data = await fetchJson<ArtifactListResponse>(
    `${API_BASE}/runs/${projectSlug}/${runId}/artifacts`,
    'Failed to fetch artifacts',
  );
  return data.artifacts;
}

export async function fetchArtifactContent(projectSlug: string, runId: string, filename: string): Promise<string> {
  const data = await fetchJson<ArtifactContentResponse>(
    `${API_BASE}/runs/${projectSlug}/${runId}/artifacts/${filename}`,
    'Failed to fetch artifact',
  );
  return data.content;
}

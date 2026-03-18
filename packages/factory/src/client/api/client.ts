import type {
  ArtifactContentResponse,
  ArtifactListResponse,
  CanonicalRunStatus,
  ProjectIndex,
  RunEventsResponse,
} from '../../shared/types/api.js';
import type { UserSettings } from '../../shared/types/settings.js';

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

/** Fetch raw header + events for a v3 run. Returns 404 for v1/v2 runs. */
export function fetchRunEvents(projectSlug: string, runId: string): Promise<RunEventsResponse> {
  return fetchJson<RunEventsResponse>(`${API_BASE}/runs/${projectSlug}/${runId}/events`, 'Failed to fetch run events');
}

export async function fetchArtifacts(projectSlug: string, runId: string): Promise<string[]> {
  const data = await fetchJson<ArtifactListResponse>(
    `${API_BASE}/runs/${projectSlug}/${runId}/artifacts`,
    'Failed to fetch artifacts',
  );
  return data.artifacts;
}

export async function fetchArtifactContent(
  projectSlug: string,
  runId: string,
  filename: string,
  options?: { format?: 'html' },
): Promise<string> {
  const url = `${API_BASE}/runs/${projectSlug}/${runId}/artifacts/${filename}`;
  const data = await fetchJson<ArtifactContentResponse>(
    options?.format === 'html' ? `${url}?format=html` : url,
    'Failed to fetch artifact',
  );
  return data.content;
}

export function fetchSettings(): Promise<UserSettings> {
  return fetchJson<UserSettings>(`${API_BASE}/settings`, 'Failed to fetch settings');
}

export async function patchSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  if (!response.ok) {
    throw new Error(`Failed to update settings: ${response.statusText}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- response.json() returns Promise<any> from DOM lib
  return response.json();
}

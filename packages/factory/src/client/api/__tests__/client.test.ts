import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchArtifactContent, fetchArtifacts, fetchProjects, fetchRunStatus } from '../client.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockResponse(data: unknown, ok = true, statusText = 'OK') {
  return {
    ok,
    statusText,
    json: () => Promise.resolve(data),
  };
}

describe('fetchJson (via fetchProjects)', () => {
  it('returns project index on success', async () => {
    const mockData = { projects: [{ slug: 'test', tickets: [] }] };
    mockFetch.mockResolvedValue(createMockResponse(mockData));

    const result = await fetchProjects();

    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledWith('/api/projects');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(createMockResponse(null, false, 'Not Found'));

    await expect(fetchProjects()).rejects.toThrow('Failed to fetch projects: Not Found');
  });

  it('throws on malformed JSON response', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    });

    await expect(fetchProjects()).rejects.toThrow(SyntaxError);
  });
});

describe('fetchRunStatus', () => {
  it('returns canonical run status on success', async () => {
    const mockData = {
      runId: 'test-run',
      projectSlug: 'test',
      status: 'completed',
    };
    mockFetch.mockResolvedValue(createMockResponse(mockData));

    const result = await fetchRunStatus('test', 'test-run');

    expect(result.runId).toBe('test-run');
    expect(mockFetch).toHaveBeenCalledWith('/api/runs/test/test-run');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(createMockResponse(null, false, 'Server Error'));

    await expect(fetchRunStatus('test', 'run')).rejects.toThrow('Failed to fetch run status: Server Error');
  });
});

describe('fetchArtifacts', () => {
  it('returns artifact list on success', async () => {
    const mockData = { artifacts: ['plan.md', 'status.json'] };
    mockFetch.mockResolvedValue(createMockResponse(mockData));

    const result = await fetchArtifacts('test', 'run');

    expect(result).toEqual(['plan.md', 'status.json']);
    expect(mockFetch).toHaveBeenCalledWith('/api/runs/test/run/artifacts');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(createMockResponse(null, false, 'Server Error'));

    await expect(fetchArtifacts('test', 'run')).rejects.toThrow('Failed to fetch artifacts: Server Error');
  });
});

describe('fetchArtifactContent', () => {
  it('returns artifact content on success', async () => {
    const mockData = { content: '# Plan\nStep 1...' };
    mockFetch.mockResolvedValue(createMockResponse(mockData));

    const result = await fetchArtifactContent('test', 'run', 'plan.md');

    expect(result).toBe('# Plan\nStep 1...');
    expect(mockFetch).toHaveBeenCalledWith('/api/runs/test/run/artifacts/plan.md');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(createMockResponse(null, false, 'Not Found'));

    await expect(fetchArtifactContent('test', 'run', 'missing.md')).rejects.toThrow(
      'Failed to fetch artifact: Not Found',
    );
  });
});

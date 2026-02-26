import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { ProjectScanner } from '../project-scanner.js';

const { mockedReaddir, mockedStat, mockedParseStatusFile } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
  mockedParseStatusFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: mockedReaddir, stat: mockedStat },
  readdir: mockedReaddir,
  stat: mockedStat,
}));

vi.mock('../../adapters/status-adapter.js', () => ({
  parseStatusFile: mockedParseStatusFile,
}));

// Helper to mock readdir returning string arrays
function mockReaddirResult(names: string[]): void {
  mockedReaddir.mockResolvedValueOnce(names);
}

// Helper to mock stat returning an object with isDirectory
function mockStatDirectory(isDir = true): void {
  mockedStat.mockResolvedValueOnce({ isDirectory: () => isDir });
}

function createMockStatus(overrides: Partial<CanonicalRunStatus> = {}): CanonicalRunStatus {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    ticketId: undefined,
    projectRoot: '/test',
    branch: 'main',
    task: 'test',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: undefined,
    status: 'completed',
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    fixLowFindings: undefined,
    phases: {
      architecture: undefined,
      planning: undefined,
      implementation: undefined,
      parallelReview: undefined,
      review: undefined,
      codeSimplifier: undefined,
      holisticReview: undefined,
    },
    phaseDecision: {},
    ...overrides,
  };
}

describe('ProjectScanner', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('scans projects with tickets/ subdirectory', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['factory']);
    mockStatDirectory();
    mockReaddirResult(['tickets']);
    mockReaddirResult(['TICKET-1']);
    mockReaddirResult(['20260225-run1']);
    mockStatDirectory();

    mockedParseStatusFile.mockResolvedValueOnce(
      createMockStatus({
        runId: '20260225-run1',
        projectSlug: 'factory',
        ticketId: 'TICKET-1',
        startedAt: '2026-02-25T00:00:00Z',
      }),
    );

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.slug).toBe('factory');
    expect(result.projects[0]?.tickets).toHaveLength(1);
    expect(result.projects[0]?.tickets[0]?.ticketId).toBe('TICKET-1');
    expect(result.projects[0]?.tickets[0]?.runs).toHaveLength(1);
    expect(result.projects[0]?.tickets[0]?.runs[0]?.runId).toBe('20260225-run1');
  });

  it('scans projects without tickets/ subdirectory (RAD-1 pattern)', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['rad-app']);
    mockStatDirectory();
    mockReaddirResult(['RAD-1']);
    mockStatDirectory();
    mockReaddirResult(['20260222-run1']);
    mockStatDirectory();

    mockedParseStatusFile.mockResolvedValueOnce(
      createMockStatus({
        runId: '20260222-run1',
        projectSlug: 'rad-app',
        ticketId: 'RAD-1',
        startedAt: '2026-02-22T22:12:23Z',
        completedAt: '2026-02-22T23:40:57Z',
        phases: {
          architecture: undefined,
          planning: undefined,
          implementation: undefined,
          parallelReview: undefined,
          review: { status: 'approved', iterations: 2, finalCriticality: 'low' },
          codeSimplifier: undefined,
          holisticReview: undefined,
        },
      }),
    );

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.slug).toBe('rad-app');
    expect(result.projects[0]?.tickets[0]?.ticketId).toBe('RAD-1');
  });

  it('handles missing base directory gracefully', async () => {
    const scanner = new ProjectScanner('/nonexistent');

    mockedReaddir.mockRejectedValueOnce(new Error('ENOENT'));

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(0);
  });

  it('sorts runs by startedAt descending', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory();
    mockReaddirResult(['run-old', 'run-new']);
    mockStatDirectory();
    mockStatDirectory();

    mockedParseStatusFile.mockResolvedValueOnce(
      createMockStatus({
        runId: 'run-old',
        startedAt: '2026-01-01T00:00:00Z',
      }),
    );

    mockedParseStatusFile.mockResolvedValueOnce(
      createMockStatus({
        runId: 'run-new',
        startedAt: '2026-02-01T00:00:00Z',
      }),
    );

    const result = await scanner.scan();

    const runs = result.projects[0]?.tickets[0]?.runs;
    expect(runs).toHaveLength(2);
    expect(runs?.[0]?.runId).toBe('run-new');
    expect(runs?.[1]?.runId).toBe('run-old');
  });

  it('filters hidden directories', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['.hidden', 'visible']);
    mockStatDirectory();
    mockReaddirResult([]);

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(0);
    expect(mockedStat).toHaveBeenCalledTimes(1);
  });

  it('returns cached index from getIndex()', async () => {
    const scanner = new ProjectScanner('/test/projects');

    expect(scanner.getIndex()).toBeNull();

    mockReaddirResult([]);
    await scanner.scan();

    const index = scanner.getIndex();
    expect(index).not.toBeNull();
    expect(index?.projects).toHaveLength(0);
  });
});

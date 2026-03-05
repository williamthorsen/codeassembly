import { homedir } from 'node:os';
import { join } from 'node:path';

import { RunDataParseError } from '@codeassembly/run-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { silencedConsole } from '../../../test-utils.js';
import { ProjectScanner } from '../project-scanner.js';

const { mockedReaddir, mockedStat, mockedParseRunData } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
  mockedParseRunData: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: mockedReaddir, stat: mockedStat },
  readdir: mockedReaddir,
  stat: mockedStat,
}));

vi.mock('../../adapters/status-adapter.js', () => ({
  parseRunData: mockedParseRunData,
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
    reason: undefined,
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
    mode: undefined,
    model: undefined,
    phaseDecisions: {},
    artifacts: undefined,
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
    mockStatDirectory(); // stat check for TICKET-1 directory
    mockReaddirResult(['20260225-run1']);
    mockStatDirectory(); // stat check for run directory

    mockedParseRunData.mockResolvedValueOnce(
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
    expect(result.projects[0]?.tickets[0]?.runs[0]?.completedAt).toBeUndefined();
  });

  it('scans projects without tickets/ subdirectory (RAD-1 pattern)', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['rad-app']);
    mockStatDirectory();
    mockReaddirResult(['RAD-1']);
    mockStatDirectory();
    mockReaddirResult(['20260222-run1']);
    mockStatDirectory();

    mockedParseRunData.mockResolvedValueOnce(
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
    expect(result.projects[0]?.tickets[0]?.runs[0]?.completedAt).toBe('2026-02-22T23:40:57Z');
  });

  // Error recovery: graceful degradation — returns an empty index rather than throwing
  it('handles missing base directory gracefully', async () => {
    using _silent = silencedConsole();
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

    mockedParseRunData.mockResolvedValueOnce(
      createMockStatus({
        runId: 'run-old',
        startedAt: '2026-01-01T00:00:00Z',
      }),
    );

    mockedParseRunData.mockResolvedValueOnce(
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

  // Error recovery: skip-and-continue — invalid runs are skipped, valid siblings still collected
  it.each([
    {
      category: 'invalid_schema' as const,
      message: 'Invalid run-index.json at /test/path',
      expectedSuggestion: 'incompatible version',
    },
    {
      category: 'corrupt_json' as const,
      message: 'Failed to parse JSON at /test/path',
      expectedSuggestion: 'Check for syntax errors',
    },
    {
      category: 'missing_companion' as const,
      message: 'v3 run-index.json found but run-log.jsonl is missing',
      expectedSuggestion: 'run may have been interrupted',
    },
  ])(
    'logs warning with suggestion for $category errors and skips the run',
    async ({ category, message, expectedSuggestion }) => {
      using silent = silencedConsole();
      const scanner = new ProjectScanner('/test/projects');

      mockReaddirResult(['proj']);
      mockStatDirectory();
      mockReaddirResult(['tickets']);
      mockReaddirResult(['TICKET-1']);
      mockStatDirectory(); // stat for TICKET-1 directory
      mockReaddirResult(['bad-run', 'good-run']);
      mockStatDirectory(); // stat for bad-run directory
      mockStatDirectory(); // stat for good-run directory

      mockedParseRunData.mockRejectedValueOnce(new RunDataParseError(message, category, '/test/path'));
      mockedParseRunData.mockResolvedValueOnce(
        createMockStatus({
          runId: 'good-run',
          startedAt: '2026-03-01T00:00:00Z',
        }),
      );

      const result = await scanner.scan();

      expect(result.projects).toHaveLength(1);
      const runs = result.projects[0]?.tickets[0]?.runs;
      expect(runs).toHaveLength(1);
      expect(runs?.[0]?.runId).toBe('good-run');

      expect(silent.warn).toHaveBeenCalledOnce();
      expect(silent.warn).toHaveBeenCalledWith(
        expect.stringContaining('[project-scanner] Skipping proj/TICKET-1/bad-run:'),
      );
      expect(silent.warn).toHaveBeenCalledWith(expect.stringContaining(message));
      expect(silent.warn).toHaveBeenCalledWith(expect.stringContaining(expectedSuggestion));
      expect(silent.error).not.toHaveBeenCalled();
    },
  );

  it('logs error for non-RunDataParseError exceptions during run parsing', async () => {
    using silent = silencedConsole();
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['tickets']);
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory(); // stat for TICKET-1 directory
    mockReaddirResult(['bad-run', 'good-run']);
    mockStatDirectory(); // stat for bad-run directory
    mockStatDirectory(); // stat for good-run directory

    mockedParseRunData.mockRejectedValueOnce(new Error('Permission denied'));
    mockedParseRunData.mockResolvedValueOnce(
      createMockStatus({
        runId: 'good-run',
        startedAt: '2026-03-01T00:00:00Z',
      }),
    );

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    const runs = result.projects[0]?.tickets[0]?.runs;
    expect(runs).toHaveLength(1);
    expect(runs?.[0]?.runId).toBe('good-run');

    expect(silent.error).toHaveBeenCalledOnce();
    expect(silent.error).toHaveBeenCalledWith(
      expect.stringContaining('Error parsing run data for proj/TICKET-1/bad-run:'),
      expect.any(Error),
    );
    expect(silent.warn).not.toHaveBeenCalled();
  });

  // Error recovery: ENOENT from run directories with no recognized log files
  it('logs warning and skips run directories where neither run-index.json nor status.json exists', async () => {
    using silent = silencedConsole();
    const scanner = new ProjectScanner('/test/projects');

    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['tickets']);
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory(); // stat for TICKET-1 directory
    mockReaddirResult(['empty-run', 'good-run']);
    mockStatDirectory(); // stat for empty-run directory
    mockStatDirectory(); // stat for good-run directory

    const enoentError = new Error('ENOENT: no such file or directory');
    Object.assign(enoentError, { code: 'ENOENT' });
    mockedParseRunData.mockRejectedValueOnce(enoentError);
    mockedParseRunData.mockResolvedValueOnce(
      createMockStatus({
        runId: 'good-run',
        startedAt: '2026-03-01T00:00:00Z',
      }),
    );

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    const runs = result.projects[0]?.tickets[0]?.runs;
    expect(runs).toHaveLength(1);
    expect(runs?.[0]?.runId).toBe('good-run');

    expect(silent.warn).toHaveBeenCalledOnce();
    expect(silent.warn).toHaveBeenCalledWith(
      expect.stringContaining('[project-scanner] Skipping proj/TICKET-1/empty-run:'),
    );
    expect(silent.warn).toHaveBeenCalledWith(expect.stringContaining('no run-index.json or status.json found'));
    expect(silent.error).not.toHaveBeenCalled();
  });

  it('does not scan direct entries when tickets/ directory exists', async () => {
    const scanner = new ProjectScanner('/test/projects');

    // Project has both tickets/ directory and a sibling directory OTHER-1
    mockReaddirResult(['proj']);
    mockStatDirectory();
    mockReaddirResult(['tickets', 'OTHER-1']);
    // Pattern 1: scan tickets/ directory
    mockReaddirResult(['TICKET-1']);
    mockStatDirectory(); // stat for TICKET-1 directory
    mockReaddirResult(['20260301-run']);
    mockStatDirectory(); // stat for run directory

    mockedParseRunData.mockResolvedValueOnce(
      createMockStatus({
        runId: '20260301-run',
        projectSlug: 'proj',
        ticketId: 'TICKET-1',
        startedAt: '2026-03-01T00:00:00Z',
      }),
    );

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.tickets).toHaveLength(1);
    expect(result.projects[0]?.tickets[0]?.ticketId).toBe('TICKET-1');
    // OTHER-1 should NOT appear as a ticket — Pattern 2 was skipped
    const ticketIds = result.projects[0]?.tickets.map((t) => t.ticketId);
    expect(ticketIds).not.toContain('OTHER-1');
  });

  it('uses AI_PROJECTS_PATH environment variable when no basePath is provided', async () => {
    const originalEnv = process.env.AI_PROJECTS_PATH;
    try {
      process.env.AI_PROJECTS_PATH = '/custom/ai/path';
      const scanner = new ProjectScanner();

      mockReaddirResult(['my-project']);
      mockStatDirectory();
      mockReaddirResult(['TICKET-1']);
      mockStatDirectory();
      mockReaddirResult(['run-1']);
      mockStatDirectory();

      mockedParseRunData.mockResolvedValueOnce(
        createMockStatus({
          runId: 'run-1',
          startedAt: '2026-03-01T00:00:00Z',
        }),
      );

      const result = await scanner.scan();

      expect(result.projects).toHaveLength(1);
      // Implementation-level check: verifies the constructor resolved the env var correctly.
      // Mock call assertion is standard here since filesystem ops are fully mocked.
      expect(mockedReaddir).toHaveBeenCalledWith('/custom/ai/path');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.AI_PROJECTS_PATH;
      } else {
        process.env.AI_PROJECTS_PATH = originalEnv;
      }
    }
  });

  it('exposes basePath via getBasePath()', () => {
    const scanner = new ProjectScanner('/custom/path');
    expect(scanner.getBasePath()).toBe('/custom/path');
  });

  it('falls back to homedir default when no basePath or env var is set', async () => {
    const originalEnv = process.env.AI_PROJECTS_PATH;
    try {
      delete process.env.AI_PROJECTS_PATH;
      const scanner = new ProjectScanner();

      mockReaddirResult([]);

      await scanner.scan();

      const expectedPath = join(homedir(), '.ai', 'projects');
      expect(mockedReaddir).toHaveBeenCalledWith(expectedPath);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.AI_PROJECTS_PATH;
      } else {
        process.env.AI_PROJECTS_PATH = originalEnv;
      }
    }
  });
});

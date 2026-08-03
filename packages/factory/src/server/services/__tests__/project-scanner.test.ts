import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanonicalRunStatus } from '../../../shared/types/canonical.js';
import { silencedConsole } from '../../../utils/test-utils.ts';
import { ProjectScanner } from '../project-scanner.js';

const { mockedDiscover, mockedValidate } = vi.hoisted(() => ({
  mockedDiscover: vi.fn(),
  mockedValidate: vi.fn(),
}));

vi.mock('codeassembly-run-core/scanners', () => ({
  discoverRunDirectories: mockedDiscover,
  validateRunDirectory: mockedValidate,
}));

// Reset the config module so each test can set its own env var
vi.mock('../../../config.js', () => ({
  factoryConfig: {
    get logInvalidRuns() {
      return process.env.FACTORY_LOG_INVALID_RUNS === 'true';
    },
  },
}));

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
    waitingForInput: undefined,
    externalPlan: false,
    mergeBaseSha: undefined,
    diffBase: undefined,
    maxReviewRounds: undefined,
    effort: undefined,
    approvalThreshold: undefined,
    budgetThreshold: undefined,
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
    delete process.env.FACTORY_LOG_INVALID_RUNS;
  });

  it('builds index from discovered valid run directories', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([
      {
        projectSlug: 'factory',
        ticketId: 'TICKET-1',
        runId: 'run-1',
        runPath: '/test/projects/factory/tickets/TICKET-1/run-1',
      },
    ]);
    mockedValidate.mockResolvedValue({
      valid: true,
      status: createMockStatus({
        runId: 'run-1',
        projectSlug: 'factory',
        ticketId: 'TICKET-1',
        startedAt: '2026-03-01T00:00:00Z',
      }),
    });

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.slug).toBe('factory');
    expect(result.projects[0]?.tickets[0]?.runs[0]?.runId).toBe('run-1');
  });

  it('sorts runs by startedAt descending', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([
      { projectSlug: 'proj', ticketId: 'T-1', runId: 'old', runPath: '/p/old' },
      { projectSlug: 'proj', ticketId: 'T-1', runId: 'new', runPath: '/p/new' },
    ]);
    mockedValidate
      .mockResolvedValueOnce({
        valid: true,
        status: createMockStatus({ runId: 'old', startedAt: '2026-01-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        valid: true,
        status: createMockStatus({ runId: 'new', startedAt: '2026-02-01T00:00:00Z' }),
      });

    const result = await scanner.scan();

    const runs = result.projects[0]?.tickets[0]?.runs;
    expect(runs?.[0]?.runId).toBe('new');
    expect(runs?.[1]?.runId).toBe('old');
  });

  it('suppresses invalid-run warnings by default', async () => {
    using silent = silencedConsole(['error', 'warn']);
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([{ projectSlug: 'proj', ticketId: 'T-1', runId: 'bad', runPath: '/p/bad' }]);
    mockedValidate.mockResolvedValue({ valid: false, reason: 'missing run-index.json' });

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(0);
    expect(silent.warn).not.toHaveBeenCalled();
  });

  it('logs invalid-run warnings when FACTORY_LOG_INVALID_RUNS is enabled', async () => {
    using silent = silencedConsole(['error', 'warn']);
    process.env.FACTORY_LOG_INVALID_RUNS = 'true';
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([{ projectSlug: 'proj', ticketId: 'T-1', runId: 'bad', runPath: '/p/bad' }]);
    mockedValidate.mockResolvedValue({ valid: false, reason: 'missing run-index.json' });

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(0);
    expect(silent.warn).toHaveBeenCalledOnce();
    expect(silent.warn).toHaveBeenCalledWith(
      expect.stringContaining('[project-scanner] Skipping proj/T-1/bad: missing run-index.json'),
    );
  });

  it('always logs unexpected errors regardless of config', async () => {
    using silent = silencedConsole(['error']);
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([{ projectSlug: 'proj', ticketId: 'T-1', runId: 'bad', runPath: '/p/bad' }]);
    mockedValidate.mockRejectedValue(new Error('Permission denied'));

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(0);
    expect(silent.error).toHaveBeenCalledOnce();
  });

  it('groups runs by project and ticket', async () => {
    const scanner = new ProjectScanner('/test/projects');

    mockedDiscover.mockResolvedValue([
      { projectSlug: 'proj-a', ticketId: 'T-1', runId: 'run-1', runPath: '/p/run-1' },
      { projectSlug: 'proj-a', ticketId: 'T-2', runId: 'run-2', runPath: '/p/run-2' },
      { projectSlug: 'proj-b', ticketId: 'T-3', runId: 'run-3', runPath: '/p/run-3' },
    ]);
    mockedValidate
      .mockResolvedValueOnce({
        valid: true,
        status: createMockStatus({ runId: 'run-1', startedAt: '2026-01-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        valid: true,
        status: createMockStatus({ runId: 'run-2', startedAt: '2026-02-01T00:00:00Z' }),
      })
      .mockResolvedValueOnce({
        valid: true,
        status: createMockStatus({ runId: 'run-3', startedAt: '2026-03-01T00:00:00Z' }),
      });

    const result = await scanner.scan();

    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]?.slug).toBe('proj-a');
    expect(result.projects[0]?.tickets).toHaveLength(2);
    expect(result.projects[1]?.slug).toBe('proj-b');
  });

  it('caches index via getIndex()', async () => {
    const scanner = new ProjectScanner('/test/projects');
    expect(scanner.getIndex()).toBeNull();

    mockedDiscover.mockResolvedValue([]);
    await scanner.scan();

    expect(scanner.getIndex()).not.toBeNull();
  });

  it('exposes basePath via getBasePath()', () => {
    const scanner = new ProjectScanner('/custom/path');
    expect(scanner.getBasePath()).toBe('/custom/path');
  });
});

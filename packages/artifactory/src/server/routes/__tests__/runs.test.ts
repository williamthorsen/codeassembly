import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.js';
import { createRunsRouter } from '../runs.js';
import { createMockResponse, createMockScanner, getHandler, type MockResponse } from './route-test-helpers.js';

const { mockedReaddir, mockedReadFile, mockedParseStatusFile } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedReadFile: vi.fn(),
  mockedParseStatusFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: mockedReaddir, readFile: mockedReadFile },
  readdir: mockedReaddir,
  readFile: mockedReadFile,
}));

vi.mock('../../adapters/status-adapter.js', () => ({
  parseStatusFile: mockedParseStatusFile,
}));

const RUN_PATH = '/projects/test-project/tickets/TICKET-1/run-1';

function indexWithRun(): ProjectIndex {
  return {
    projects: [
      {
        slug: 'test-project',
        tickets: [
          {
            ticketId: 'TICKET-1',
            runs: [
              {
                runId: 'run-1',
                path: RUN_PATH,
                status: 'completed',
                startedAt: '2026-01-01T00:00:00Z',
              },
            ],
          },
        ],
      },
    ],
  };
}

function createEnoentError(path: string): Error {
  const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
  Object.defineProperty(error, 'code', { value: 'ENOENT', writable: false });
  return error;
}

describe('createRunsRouter', () => {
  let res: MockResponse;

  beforeEach(() => {
    vi.resetAllMocks();
    res = createMockResponse();
  });

  describe('GET /:projectSlug/:runId', () => {
    it('returns run status on success', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      const mockStatus = { runId: 'run-1', status: 'completed' };
      mockedParseStatusFile.mockResolvedValueOnce(mockStatus);

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(mockedParseStatusFile).toHaveBeenCalledWith(join(RUN_PATH, 'status.json'));
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockStatus);
    });

    it('returns 404 when run is not found', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      await handler({ params: { projectSlug: 'test-project', runId: 'nonexistent' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    it('returns 404 when scanner has no index', async () => {
      const scanner = createMockScanner(null);
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    it('returns 404 when status file does not exist (ENOENT)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      mockedParseStatusFile.mockRejectedValueOnce(createEnoentError(join(RUN_PATH, 'status.json')));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Status file not found' });
    });

    it('returns 500 on non-ENOENT errors', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      mockedParseStatusFile.mockRejectedValueOnce(new Error('Parse error'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to get run status' });
    });
  });

  describe('GET /:projectSlug/:runId/artifacts', () => {
    it('includes only .md and .json files and excludes other extensions', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      mockedReaddir.mockResolvedValueOnce([
        'status.json',
        'plan.md',
        'notes.txt',
        'architecture.json',
        'image.png',
        'data.csv',
      ]);

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ artifacts: ['status.json', 'plan.md', 'architecture.json'] });
    });

    it('returns 404 when run is not found', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      await handler({ params: { projectSlug: 'test-project', runId: 'missing' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    it('returns 500 when readdir fails', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      mockedReaddir.mockRejectedValueOnce(new Error('Permission denied'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to list artifacts' });
    });

    it('returns 500 when readdir fails with ENOENT (directory removed after index lookup)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      mockedReaddir.mockRejectedValueOnce(createEnoentError(RUN_PATH));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to list artifacts' });
    });

    it('returns empty artifacts array when directory contains no .md or .json files', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      mockedReaddir.mockResolvedValueOnce(['image.png', 'data.csv', 'notes.txt']);

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ artifacts: [] });
    });
  });

  describe('GET /:projectSlug/:runId/artifacts/:filename', () => {
    it('returns artifact content', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      mockedReadFile.mockResolvedValueOnce('# Plan\nStep 1...');

      await handler(
        { params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' } },
        res,
      );

      expect(mockedReadFile).toHaveBeenCalledWith(join(RUN_PATH, 'plan.md'), 'utf8');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ content: '# Plan\nStep 1...' });
    });

    it('returns 404 when artifact file does not exist (ENOENT)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      mockedReadFile.mockRejectedValueOnce(createEnoentError(join(RUN_PATH, 'missing.md')));

      await handler(
        { params: { projectSlug: 'test-project', runId: 'run-1', filename: 'missing.md' } },
        res,
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Artifact not found' });
    });

    it('returns 500 on non-ENOENT read errors', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      mockedReadFile.mockRejectedValueOnce(new Error('EPERM'));

      await handler(
        { params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' } },
        res,
      );

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to read artifact' });
    });

    it('returns 404 when run is not found', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      await handler(
        { params: { projectSlug: 'test-project', runId: 'missing', filename: 'plan.md' } },
        res,
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    describe('path traversal validation', () => {
      it('rejects filename with ".."', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler(
          { params: { projectSlug: 'test-project', runId: 'run-1', filename: '../etc/passwd' } },
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });

      it('rejects filename with forward slash', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler(
          { params: { projectSlug: 'test-project', runId: 'run-1', filename: 'sub/file.md' } },
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });

      it('rejects filename with backslash', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler(
          { params: { projectSlug: 'test-project', runId: 'run-1', filename: String.raw`sub\file.md` } },
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });

      it('rejects filename with null byte', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler(
          { params: { projectSlug: 'test-project', runId: 'run-1', filename: 'file\0.md' } },
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });

      it('rejects URL-decoded ".." (Express decodes %2E%2E before handler)', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        // Express decodes %2E%2E to ".." before the handler sees it
        await handler(
          { params: { projectSlug: 'test-project', runId: 'run-1', filename: '..%2F..%2Fetc%2Fpasswd' } },
          res,
        );

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });
    });
  });
});

import { join } from 'node:path';

import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { RunDataParseError } from 'codeassembly-run-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.ts';
import { createRunsRouter } from '../runs.ts';
import { createMockResponse, createMockScanner, getHandler, type MockResponse } from './route-test-helpers.ts';

const { mockedReaddir, mockedReadFile, mockedParseRunData, mockedParseRunRawData } = vi.hoisted(() => ({
  mockedReaddir: vi.fn(),
  mockedReadFile: vi.fn(),
  mockedParseRunData: vi.fn(),
  mockedParseRunRawData: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: mockedReaddir, readFile: mockedReadFile },
  readdir: mockedReaddir,
  readFile: mockedReadFile,
}));

vi.mock('codeassembly-run-core/parsers', () => ({
  parseRunData: mockedParseRunData,
  parseRunRawData: mockedParseRunRawData,
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
                completedAt: undefined,
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
      mockedParseRunData.mockResolvedValueOnce(mockStatus);

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(mockedParseRunData).toHaveBeenCalledWith(RUN_PATH);
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

    it('returns 404 when run data files do not exist (ENOENT)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      mockedParseRunData.mockRejectedValueOnce(createEnoentError(RUN_PATH));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run data not found' });
    });

    it('returns 500 on non-ENOENT errors', async () => {
      using _silent = silenceConsole(['error']);
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId');

      mockedParseRunData.mockRejectedValueOnce(new Error('Parse error'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to get run status' });
    });
  });

  describe('GET /:projectSlug/:runId/events', () => {
    it('returns header and events on success', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/events');

      const mockResult = { header: { runId: 'run-1' }, events: [{ t: '2026-01-01T00:00:00Z', event: 'run_started' }] };
      mockedParseRunRawData.mockResolvedValueOnce(mockResult);

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(mockedParseRunRawData).toHaveBeenCalledWith(RUN_PATH);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockResult);
    });

    it('returns 404 when run is not found', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/events');

      await handler({ params: { projectSlug: 'test-project', runId: 'nonexistent' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    it('returns 404 when run does not have an event log', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/events');

      mockedParseRunRawData.mockRejectedValueOnce(new RunDataParseError('No event log', 'no_event_log', RUN_PATH));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run does not have an event log' });
    });

    it('returns 404 when run data files do not exist (ENOENT)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/events');

      mockedParseRunRawData.mockRejectedValueOnce(createEnoentError(RUN_PATH));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run data not found' });
    });

    it('returns 500 on generic errors', async () => {
      using _silent = silenceConsole(['error']);
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/events');

      mockedParseRunRawData.mockRejectedValueOnce(new Error('Unexpected failure'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to get run events' });
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
      using _silent = silenceConsole(['error']);
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts');

      mockedReaddir.mockRejectedValueOnce(new Error('Permission denied'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to list artifacts' });
    });

    it('returns 500 when readdir fails with ENOENT (directory removed after index lookup)', async () => {
      using _silent = silenceConsole(['error']);
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

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' } }, res);

      expect(mockedReadFile).toHaveBeenCalledWith(join(RUN_PATH, 'plan.md'), 'utf8');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ content: '# Plan\nStep 1...' });
    });

    it('returns 404 when artifact file does not exist (ENOENT)', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      mockedReadFile.mockRejectedValueOnce(createEnoentError(join(RUN_PATH, 'missing.md')));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'missing.md' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Artifact not found' });
    });

    it('returns 500 on non-ENOENT read errors', async () => {
      using _silent = silenceConsole(['error']);
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      mockedReadFile.mockRejectedValueOnce(new Error('EPERM'));

      await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' } }, res);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to read artifact' });
    });

    it('returns 404 when run is not found', async () => {
      const scanner = createMockScanner(indexWithRun());
      const router = createRunsRouter(scanner);
      const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

      await handler({ params: { projectSlug: 'test-project', runId: 'missing', filename: 'plan.md' } }, res);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: 'Run not found' });
    });

    describe('format=html', () => {
      it('renders markdown to HTML when format=html on a .md file', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        mockedReadFile.mockResolvedValueOnce('# Hello\n\nWorld');

        await handler(
          {
            params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' },
            query: { format: 'html' },
          },
          res,
        );

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ content: '<h1>Hello</h1>\n<p>World</p>\n' });
      });

      it('returns raw content when format=html on a non-.md file', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        const jsonContent = '{"key": "value"}';
        mockedReadFile.mockResolvedValueOnce(jsonContent);

        await handler(
          {
            params: { projectSlug: 'test-project', runId: 'run-1', filename: 'data.json' },
            query: { format: 'html' },
          },
          res,
        );

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ content: jsonContent });
      });

      it('returns raw content when no format param is provided', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        mockedReadFile.mockResolvedValueOnce('# Raw markdown');

        await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'plan.md' } }, res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ content: '# Raw markdown' });
      });
    });

    describe('path traversal validation', () => {
      it('rejects filename with ".."', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: '../etc/passwd' } }, res);

        expect(res.statusCode).toBe(400);
        expect(res.body).toEqual({ error: 'Invalid filename' });
      });

      it('rejects filename with forward slash', async () => {
        const scanner = createMockScanner(indexWithRun());
        const router = createRunsRouter(scanner);
        const handler = getHandler(router, 'get', '/:projectSlug/:runId/artifacts/:filename');

        await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'sub/file.md' } }, res);

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

        await handler({ params: { projectSlug: 'test-project', runId: 'run-1', filename: 'file\0.md' } }, res);

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

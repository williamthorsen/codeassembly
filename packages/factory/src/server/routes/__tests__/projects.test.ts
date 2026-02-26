import { beforeEach, describe, expect, it } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.js';
import { createProjectsRouter } from '../projects.js';
import { createMockResponse, createMockScanner, getHandler, type MockResponse } from './route-test-helpers.ts';

describe('createProjectsRouter', () => {
  let res: MockResponse;

  beforeEach(() => {
    res = createMockResponse();
  });

  it('returns 503 when scanner index is null', async () => {
    const scanner = createMockScanner(null);
    const router = createProjectsRouter(scanner);
    const handler = getHandler(router, 'get', '/');

    await handler({ params: {} }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'Index not ready' });
  });

  it('returns project index on success', async () => {
    const index: ProjectIndex = {
      projects: [
        {
          slug: 'test-project',
          tickets: [
            {
              ticketId: 'TICKET-1',
              runs: [
                {
                  runId: 'run-1',
                  path: '/path/to/run',
                  status: 'completed',
                  startedAt: '2026-01-01T00:00:00Z',
                },
              ],
            },
          ],
        },
      ],
    };
    const scanner = createMockScanner(index);
    const router = createProjectsRouter(scanner);
    const handler = getHandler(router, 'get', '/');

    await handler({ params: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(index);
  });
});

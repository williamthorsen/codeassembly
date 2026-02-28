import { describe, expect, it } from 'vitest';

import type { ProjectIndex } from '../../../shared/types/api.js';
import { flattenProjectIndex } from '../flatten-project-index.js';

function createProjectIndex(): ProjectIndex {
  return {
    projects: [
      {
        slug: 'alpha',
        tickets: [
          {
            ticketId: 'T-1',
            runs: [
              {
                runId: 'run-a',
                path: '/a',
                status: 'completed',
                startedAt: '2026-01-01T00:00:00Z',
                completedAt: undefined,
              },
              {
                runId: 'run-b',
                path: '/b',
                status: 'in_progress',
                startedAt: '2026-01-02T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
          {
            ticketId: 'T-2',
            runs: [
              {
                runId: 'run-c',
                path: '/c',
                status: 'failed',
                startedAt: '2026-01-03T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
        ],
      },
      {
        slug: 'beta',
        tickets: [
          {
            ticketId: 'T-3',
            runs: [
              {
                runId: 'run-d',
                path: '/d',
                status: 'completed',
                startedAt: '2026-01-04T00:00:00Z',
                completedAt: undefined,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('flattenProjectIndex', () => {
  it('returns empty array for null input', () => {
    expect(flattenProjectIndex(null)).toEqual([]);
  });

  it('returns empty array for empty projects array', () => {
    expect(flattenProjectIndex({ projects: [] })).toEqual([]);
  });

  it('flattens single project with multiple tickets', () => {
    const index: ProjectIndex = {
      projects: [
        {
          slug: 'alpha',
          tickets: [
            {
              ticketId: 'T-1',
              runs: [
                {
                  runId: 'run-a',
                  path: '/a',
                  status: 'completed',
                  startedAt: '2026-01-01T00:00:00Z',
                  completedAt: undefined,
                },
              ],
            },
            {
              ticketId: 'T-2',
              runs: [
                {
                  runId: 'run-b',
                  path: '/b',
                  status: 'failed',
                  startedAt: '2026-01-02T00:00:00Z',
                  completedAt: undefined,
                },
              ],
            },
          ],
        },
      ],
    };

    const result = flattenProjectIndex(index);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      projectSlug: 'alpha',
      ticketId: 'T-2',
      runId: 'run-b',
      status: 'failed',
      startedAt: '2026-01-02T00:00:00Z',
      completedAt: undefined,
    });
    expect(result[1]).toEqual({
      projectSlug: 'alpha',
      ticketId: 'T-1',
      runId: 'run-a',
      status: 'completed',
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: undefined,
    });
  });

  it('flattens multiple projects and sorts by startedAt descending', () => {
    const result = flattenProjectIndex(createProjectIndex());

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.runId)).toEqual(['run-d', 'run-c', 'run-b', 'run-a']);
  });

  it('preserves correct project and ticket context for each run', () => {
    const result = flattenProjectIndex(createProjectIndex());

    const runD = result.find((r) => r.runId === 'run-d');
    expect(runD).toEqual({
      projectSlug: 'beta',
      ticketId: 'T-3',
      runId: 'run-d',
      status: 'completed',
      startedAt: '2026-01-04T00:00:00Z',
      completedAt: undefined,
    });

    const runC = result.find((r) => r.runId === 'run-c');
    expect(runC).toEqual({
      projectSlug: 'alpha',
      ticketId: 'T-2',
      runId: 'run-c',
      status: 'failed',
      startedAt: '2026-01-03T00:00:00Z',
      completedAt: undefined,
    });
  });

  it('handles project with empty tickets array', () => {
    const index: ProjectIndex = {
      projects: [{ slug: 'empty', tickets: [] }],
    };

    expect(flattenProjectIndex(index)).toEqual([]);
  });

  it('handles ticket with empty runs array', () => {
    const index: ProjectIndex = {
      projects: [{ slug: 'proj', tickets: [{ ticketId: 'T-1', runs: [] }] }],
    };

    expect(flattenProjectIndex(index)).toEqual([]);
  });

  it('preserves a non-undefined completedAt value', () => {
    const index: ProjectIndex = {
      projects: [
        {
          slug: 'gamma',
          tickets: [
            {
              ticketId: 'T-5',
              runs: [
                {
                  runId: 'run-e',
                  path: '/e',
                  status: 'completed',
                  startedAt: '2026-01-04T12:00:00Z',
                  completedAt: '2026-01-04T13:45:00Z',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = flattenProjectIndex(index);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      projectSlug: 'gamma',
      ticketId: 'T-5',
      runId: 'run-e',
      status: 'completed',
      startedAt: '2026-01-04T12:00:00Z',
      completedAt: '2026-01-04T13:45:00Z',
    });
  });
});

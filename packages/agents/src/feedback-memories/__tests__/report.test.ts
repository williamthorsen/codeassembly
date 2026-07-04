import { describe, expect, it } from 'vitest';

import { reportSummary } from '../report.ts';
import type { FeedbackMemorySummary } from '../types.ts';

/** Builds a summary with sensible empty defaults, overridden per test. */
function summary(overrides: Partial<FeedbackMemorySummary> = {}): FeedbackMemorySummary {
  return { ok: true, machine: 'test-host', projectsRoot: '/root', projects: [], total: 0, skipped: [], ...overrides };
}

describe(reportSummary, () => {
  it('renders a three-column table closed by a total for the bare form', () => {
    const output = reportSummary(
      summary({
        total: 3,
        projects: [
          {
            store: '-a',
            label: 'app',
            repoPath: '/app',
            count: 2,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [],
          },
          {
            store: '-b',
            label: 'web',
            repoPath: '/web',
            count: 1,
            lastModified: '2026-05-20T08:00:00.000Z',
            memories: [],
          },
        ],
      }),
      {},
    );

    expect(output).toContain('Project');
    expect(output).toContain('Memories');
    expect(output).toContain('Last modified');
    expect(output).toContain('📦 app');
    expect(output).toContain('2026-06-15 12:30 UTC');
    expect(output).toContain('3 feedback memories across 2 projects');
  });

  it('lists each memory under its project in verbose form', () => {
    const output = reportSummary(
      summary({
        total: 1,
        projects: [
          {
            store: '-a',
            label: 'app',
            repoPath: '/app',
            count: 1,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [{ slug: 'feedback-never-force-push', description: 'Never force-push under any circumstance' }],
          },
        ],
      }),
      { verbose: true },
    );

    expect(output).toContain('📦 app: 1 memory');
    expect(output).toContain('feedback-never-force-push');
    expect(output).toContain('Never force-push under any circumstance');
  });

  it('truncates a long description to the available width with an ellipsis', () => {
    const output = reportSummary(
      summary({
        total: 1,
        projects: [
          {
            store: '-a',
            label: 'app',
            repoPath: '/app',
            count: 1,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [{ slug: 'x', description: 'y'.repeat(200) }],
          },
        ],
      }),
      { verbose: true, width: 40 },
    );

    const memoryLine = output.split('\n').find((line) => line.includes('…'));
    expect(memoryLine).toBeDefined();
    expect(memoryLine?.length).toBeLessThanOrEqual(40);
  });

  it('reports the empty case plainly', () => {
    expect(reportSummary(summary(), {})).toBe('No feedback memories found.');
  });
});

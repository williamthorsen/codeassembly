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

  it('warns about skipped files under the total when any are unreadable', () => {
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
            memories: [],
          },
        ],
        skipped: [
          { path: '/app/memory/feedback-bad.md', reason: 'bad yaml' },
          { path: '/app/memory/feedback-worse.md', reason: 'bad yaml' },
        ],
      }),
      {},
    );

    expect(output).toContain('1 feedback memory across 1 project');
    expect(output).toContain('2 files skipped (unreadable)');
    expect(output).not.toContain('/app/memory/feedback-bad.md');
  });

  it('lists skipped file paths under --verbose', () => {
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
            memories: [{ slug: 'feedback-ok', description: 'a readable memory' }],
          },
        ],
        skipped: [{ path: '/app/memory/feedback-bad.md', reason: 'bad yaml' }],
      }),
      { verbose: true },
    );

    expect(output).toContain('1 file skipped (unreadable)');
    expect(output).toContain('/app/memory/feedback-bad.md');
  });

  it('surfaces skipped files even when no readable memories remain', () => {
    const output = reportSummary(
      summary({ skipped: [{ path: '/app/memory/feedback-bad.md', reason: 'bad yaml' }] }),
      {},
    );

    expect(output).toContain('No feedback memories found.');
    expect(output).toContain('1 file skipped (unreadable)');
  });

  it('reports the empty case plainly', () => {
    expect(reportSummary(summary(), {})).toBe('No feedback memories found.');
  });
});

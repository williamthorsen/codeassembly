import { describe, expect, it } from 'vitest';

import { reportSummary } from '../report.ts';
import type { FeedbackMemorySummary } from '../types.ts';

describe(reportSummary, () => {
  it('renders a three-column table closed by a total for the bare form', () => {
    const output = reportSummary(
      summary({
        total: 3,
        projects: [
          {
            memoryStore: '-a',
            label: 'app',
            repoPath: '/app',
            count: 2,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [],
          },
          {
            memoryStore: '-b',
            label: 'web',
            repoPath: '/web',
            count: 1,
            lastModified: '2026-05-20T08:00:00.000Z',
            memories: [],
          },
        ],
      }),
      { width: 120 },
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
            memoryStore: '-a',
            label: 'app',
            repoPath: '/app',
            count: 1,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [{ slug: 'feedback-never-force-push', description: 'Never force-push under any circumstance' }],
          },
        ],
      }),
      { verbose: true, width: 120 },
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
            memoryStore: '-a',
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
            memoryStore: '-a',
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
      { width: 120 },
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
            memoryStore: '-a',
            label: 'app',
            repoPath: '/app',
            count: 1,
            lastModified: '2026-06-15T12:30:00.000Z',
            memories: [{ slug: 'feedback-ok', description: 'a readable memory' }],
          },
        ],
        skipped: [{ path: '/app/memory/feedback-bad.md', reason: 'bad yaml' }],
      }),
      { verbose: true, width: 120 },
    );

    expect(output).toContain('1 file skipped (unreadable)');
    expect(output).toContain('/app/memory/feedback-bad.md');
  });

  it('reports skipped files even when no readable memories remain', () => {
    const output = reportSummary(summary({ skipped: [{ path: '/app/memory/feedback-bad.md', reason: 'bad yaml' }] }), {
      width: 120,
    });

    expect(output).toContain('No feedback memories found.');
    expect(output).toContain('1 file skipped (unreadable)');
  });

  it('reports the empty case plainly', () => {
    expect(reportSummary(summary(), { width: 120 })).toBe('No feedback memories found.');
  });

  it('cuts astral text on a grapheme boundary rather than mid-character', () => {
    expect(truncatedDescription('🎉🎉🎉🎉🎉', 3)).toBe('🎉🎉…');
  });

  it('keeps a ZWJ sequence whole rather than orphaning its joiner', () => {
    const zwj = '\u{1F469}\u{200D}\u{1F4BB}';
    expect(truncatedDescription(zwj.repeat(4), 2)).toBe(`${zwj}…`);
  });

  it('leaves ASCII truncation on the same boundary as the cluster count', () => {
    expect(truncatedDescription('abcdefgh', 4)).toBe('abc…');
  });

  it('drops the description entirely when no room remains for it', () => {
    expect(truncatedDescription('anything at all', 0)).toBe('');
  });
});

// region | Helpers

/** Builds a summary with sensible empty defaults, overridden per test. */
function summary(overrides: Partial<FeedbackMemorySummary> = {}): FeedbackMemorySummary {
  return { ok: true, machine: 'test-host', projectsRoot: '/root', projects: [], total: 0, skipped: [], ...overrides };
}

/**
 * Renders one single-slug memory in verbose form at the width that leaves `room` cells for the description, and
 * returns the description cell alone. The verbose renderer allots `width - INDENT - slugWidth - GAP` to it.
 */
function truncatedDescription(description: string, room: number): string {
  const output = reportSummary(
    summary({
      total: 1,
      projects: [
        {
          memoryStore: '-a',
          label: 'app',
          repoPath: '/app',
          count: 1,
          lastModified: '2026-06-15T12:30:00.000Z',
          memories: [{ slug: 'x', description }],
        },
      ],
    }),
    { verbose: true, width: room + 6 },
  );
  const memoryLine = output.split('\n', 2)[1] ?? '';
  return memoryLine.slice('   x  '.length);
}

// endregion | Helpers

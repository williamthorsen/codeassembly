import { describe, expect, it } from 'vitest';

import { describeImpact, describeSuggestion, renderArtifact, renderRemainder } from '../render.ts';
import { buildCluster, buildRecord } from '../test-utils/build-record.ts';

describe(renderArtifact, () => {
  it('renders the surfaced clusters with their signals in separate columns', () => {
    const artifact = renderArtifact(
      buildRecord({
        clusters: [
          buildCluster({
            challenge: { argument: 'a', outcome: 'modified', originalPriority: 'medium', note: 'n' },
            result: { ticket: 'https://github.com/o/r/issues/9', marked: true },
          }),
        ],
        remainder: { clusters: 0, events: 0, excluded: 2 },
      }),
    );

    expect(artifact).toContain(
      '| `sentence-case` | Headings use sentence case. | 2 | 1 high, 1 unrated | 2026-10-05 | high | Recurs across skills and reaches published text. | modified (was medium) | ticket against `content/rulebooks/writing.md` in o/r | approved | https://github.com/o/r/issues/9; events marked |',
    );
    expect(artifact).toContain('0 more clusters, 0 events, remain in the pool; 2 deferred clusters are excluded.');
    expect(artifact).toContain('- `sentence-case` in `codeassembly`: `01A`, `01B`');
  });

  it('leaves the clusters that the run did not surface out of the table', () => {
    const artifact = renderArtifact(buildRecord());
    expect(artifact).not.toContain('commit-scope');
  });

  it('escapes a pipe in a cell', () => {
    const artifact = renderArtifact(buildRecord({ clusters: [buildCluster({ lesson: 'Use a | b' })] }));
    expect(artifact).toContain(String.raw`| Use a \| b |`);
  });

  it('describes a declined disposition as not applied', () => {
    const artifact = renderArtifact(buildRecord({ clusters: [buildCluster({ decision: 'declined' })] }));
    expect(artifact).toContain('| declined | not applied |');
  });
});

describe(renderRemainder, () => {
  it('uses the singular for a count of one', () => {
    expect(renderRemainder(buildRecord({ remainder: { clusters: 1, events: 1, excluded: 1 } }))).toBe(
      '1 more cluster, 1 event, remain in the pool; 1 deferred cluster is excluded.',
    );
  });
});

describe(describeSuggestion, () => {
  it.each([
    [
      { kind: 'ticket-new', target: 'skills/x/SKILL.md', repo: 'o/r' } as const,
      'ticket for new `skills/x/SKILL.md` in o/r',
    ],
    [{ kind: 'ticket-undecided', target: null, repo: 'o/r' } as const, 'ticket, target undecided, in o/r'],
    [
      { kind: 'comment', issue: 'https://github.com/o/r/issues/7' } as const,
      'comment on https://github.com/o/r/issues/7',
    ],
    [{ kind: 'impact', level: 'low' } as const, 'set impact to low'],
    [{ kind: 'defer' } as const, 'defer'],
  ])('describes %o', (suggestion, expected) => {
    expect(describeSuggestion(suggestion)).toBe(expected);
  });
});

describe(describeImpact, () => {
  it('omits the levels without any events', () => {
    expect(describeImpact({ critical: 1, high: 0, medium: 0, low: 2, unrated: 0 })).toBe('1 critical, 2 low');
  });
});

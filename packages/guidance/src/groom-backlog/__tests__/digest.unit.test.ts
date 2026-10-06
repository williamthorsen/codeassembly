import { describe, expect, it } from 'vitest';

import { mergeOverlaps, renderDigest } from '../digest.ts';
import type { AssessmentRecord } from '../schemas.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import type { Escalation } from '../types.ts';

describe(renderDigest, () => {
  it('shows a hub once per page with its dependents, and numbers every entry', () => {
    const escalations = [
      buildEscalation(30, { dependsOn: 5 }),
      buildEscalation(10),
      buildEscalation(20, { dependsOn: 5 }),
    ];

    const [page] = renderDigest({ escalations, pageSize: 20, titles: new Map([[5, 'Decide the format']]) });

    expect(page?.hubs).toStrictEqual([5]);
    expect(page?.markdown.match(/### Hub: #5 Decide the format/g)).toHaveLength(1);
    expect(page?.entries.map((entry) => [entry.index, entry.number])).toStrictEqual([
      [1, 20],
      [2, 30],
      [3, 10],
    ]);
    expect(page?.markdown).not.toContain('Depends on #5');
  });

  it('leads a hub with its own escalation, under one heading, when the hub escalated too', () => {
    const escalations = [
      buildEscalation(12, { dependsOn: 50 }),
      buildEscalation(50),
      buildEscalation(80, { dependsOn: 50 }),
    ];

    const [page] = renderDigest({ escalations, pageSize: 20, titles: new Map() });

    expect(page?.markdown.match(/### Hub: #50/g)).toHaveLength(1);
    expect(page?.entries.map((entry) => entry.number)).toStrictEqual([50, 12, 80]);
  });

  it('does not make a hub of a ticket that one escalation on the page depends on', () => {
    const [page] = renderDigest({
      escalations: [buildEscalation(20, { dependsOn: 5 }), buildEscalation(30)],
      pageSize: 20,
      titles: new Map(),
    });

    expect(page?.hubs).toStrictEqual([]);
    expect(page?.markdown).toContain('Depends on #5');
  });

  it('shows the in-progress signal with commits ahead and the last-commit date', () => {
    const inProgress = {
      signal: 'manifest' as const,
      ref: '20-x',
      commitsAhead: 3,
      lastCommitAt: '2026-09-01T00:00:00Z',
    };

    const [page] = renderDigest({
      escalations: [buildEscalation(20, { inProgress })],
      pageSize: 20,
      titles: new Map(),
    });

    expect(page?.markdown).toContain(
      'In progress: `20-x` (manifest), 3 commits ahead, last commit 2026-09-01T00:00:00Z',
    );
  });

  it("shows each entry's proposal, and the draft under an entry that has one", () => {
    const draft = {
      sections: [{ heading: 'Context', body: 'The uploader moved.\n\n- It lives in `src/transport/`.' }],
      children: [],
    };
    const update = { ...buildEscalation(20), reply: buildReply({ number: 20, recommendation: 'update', draft }) };

    const [page] = renderDigest({ escalations: [buildEscalation(10), update], pageSize: 20, titles: new Map() });

    expect(page?.entries.map((entry) => entry.proposed)).toStrictEqual([{ decision: 'leave' }, { decision: 'update' }]);
    expect(page?.markdown).toContain('   - Proposed: leave\n');
    expect(page?.markdown).toContain(
      [
        '   - Proposed: `update`, applying the draft below',
        '   - Draft:',
        '',
        '     #### Context',
        '',
        '     The uploader moved.',
        '',
        '     - It lives in `src/transport/`.',
      ].join('\n'),
    );
  });

  it('splits the escalations into pages of the page size', () => {
    const escalations = Array.from({ length: 45 }, (_, index) => buildEscalation(index + 1));

    const pages = renderDigest({ escalations, pageSize: 20, titles: new Map() });

    expect(pages.map((page) => page.entries.length)).toStrictEqual([20, 20, 5]);
    expect(pages[2]?.markdown).toContain('## Escalations, page 3 of 3');
  });
});

describe(mergeOverlaps, () => {
  it('merges overlapping groups by union and picks the most-named survivor', () => {
    const groups = mergeOverlaps([
      buildEscalation(1, { overlaps: [{ tickets: [1, 2], survivor: 2, reason: 'Same flag' }] }),
      buildEscalation(3, { overlaps: [{ tickets: [3, 2], survivor: 2, reason: 'Same flag' }] }),
      buildEscalation(8, { overlaps: [{ tickets: [8, 9], survivor: 8, reason: 'Same docs' }] }),
    ]);

    expect(groups).toStrictEqual([
      { reasons: ['Same flag'], survivor: 2, tickets: [1, 2, 3] },
      { reasons: ['Same docs'], survivor: 8, tickets: [8, 9] },
    ]);
  });
});

// region | Helpers

/** Builds an escalation of ticket `number`, without a reply file. */
function buildEscalation(number: number, overrides: Partial<AssessmentRecord> = {}): Escalation {
  return {
    record: {
      run: 'r',
      kind: 'assessment',
      number,
      assessedAt: '2026-10-01T00:00:00Z',
      sha: 'abc1234',
      ticketUpdatedAt: '2026-01-01T00:00:00Z',
      verdicts: {
        drift: 'none',
        relevance: 'uncertain',
        progress: 'none',
        advisability: 'advisable',
        complexity: 'mechanical',
      },
      recommendation: 'escalate',
      confidence: 'medium',
      reason: 'The need may have changed.',
      relatedTickets: [],
      inProgress: null,
      class: 'escalate',
      rule: null,
      dependsOn: null,
      overlaps: [],
      ...overrides,
    },
    reply: undefined,
  };
}

// endregion | Helpers

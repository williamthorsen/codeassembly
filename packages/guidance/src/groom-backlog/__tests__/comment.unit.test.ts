import { describe, expect, it } from 'vitest';

import { renderComment, shouldPostComment, type StoredReply } from '../comment.ts';
import { parseMarkers } from '../marker.ts';
import { buildReply } from '../test-utils/build-reply.ts';

const PROVENANCE = { assessedAt: '2026-10-01T12:00:00Z', sha: 'abc1234', umbrella: false };

describe(renderComment, () => {
  it('posts the assessment, the disposition with the reason, and the marker', () => {
    const reply: StoredReply = { ...buildReply({ recommendation: 'close-complete' }), ...PROVENANCE };

    const body = renderComment(
      { decidedBy: 'policy', decision: 'close-complete', reason: undefined, run: 'r', supersededBy: undefined },
      reply,
    );

    expect(body.startsWith('## Assessment: Add a retry')).toBe(true);
    expect(body).toContain('**Disposition:** Closed as complete. The ticket stands as written.');
    expect(parseMarkers(body)).toStrictEqual([
      {
        run: 'r',
        assessedAt: PROVENANCE.assessedAt,
        sha: PROVENANCE.sha,
        verdicts: reply.verdicts,
        recommendation: 'close-complete',
        confidence: 'high',
        rule: null,
        remainder: [],
        decision: 'close-complete',
        actor: 'agent',
        decidedBy: 'policy',
      },
    ]);
  });

  it('lists each unmet part under Remainder for a half-met close, and marks the rule', () => {
    const reply: StoredReply = {
      ...buildReply({ recommendation: 'close-superseded', rule: 'half-met', remainder: ['Add a flag', 'Document it'] }),
      ...PROVENANCE,
    };

    const body = renderComment(
      { decidedBy: 'policy', decision: 'close-superseded', reason: undefined, run: 'r', supersededBy: undefined },
      reply,
    );

    expect(body).toContain("under the sweep's half-met rule");
    expect(body).toContain('**Remainder:**\n\n- Add a flag\n- Document it');
    expect(parseMarkers(body)[0]).toMatchObject({ rule: 'half-met', remainder: ['Add a flag', 'Document it'] });
  });

  it('renders a bulk decision without an assessment, with null verdicts and recommendation', () => {
    const body = renderComment(
      {
        decidedBy: 'bulk',
        decision: 'close-not-planned',
        reason: 'The package is dormant.',
        run: 'r',
        supersededBy: undefined,
      },
      undefined,
    );

    expect(body.startsWith('**Disposition:** Closed as not planned. The package is dormant.')).toBe(true);
    expect(parseMarkers(body)[0]).toMatchObject({ verdicts: null, recommendation: null, decidedBy: 'bulk' });
  });
});

describe(shouldPostComment, () => {
  const PARTIAL: StoredReply = {
    ...buildReply({ verdicts: { ...buildReply().verdicts, progress: 'partial' } }),
    ...PROVENANCE,
  };

  it('posts a keep whose verdicts are not baseline', () => {
    expect(shouldPostComment({ decidedBy: 'user', decision: 'keep' }, PARTIAL)).toBe(true);
  });

  it("does not post an umbrella's keep whose only non-baseline verdict is partial progress", () => {
    expect(shouldPostComment({ decidedBy: 'user', decision: 'revise' }, { ...PARTIAL, umbrella: true })).toBe(false);
  });

  it('posts a close whatever the verdicts', () => {
    expect(
      shouldPostComment({ decidedBy: 'user', decision: 'close-not-planned' }, { ...buildReply(), ...PROVENANCE }),
    ).toBe(true);
  });
});

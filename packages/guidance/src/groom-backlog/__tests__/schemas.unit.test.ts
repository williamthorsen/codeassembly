import { describe, expect, it } from 'vitest';

import { AssessorReplySchema } from '../schemas.ts';
import { buildReply } from '../test-utils/build-reply.ts';

const SECTION = { heading: 'Context', body: 'The uploader lives in `src/transport/`.' };
const CHILD = { title: 'Add the backoff', body: '## Problem\n\nThe retry does not back off.' };

describe('AssessorReplySchema', () => {
  it('accepts a reply that omits the draft when the recommendation does not draft one', () => {
    const { draft: _draft, ...reply } = buildReply();

    expect(AssessorReplySchema.safeParse(reply)).toMatchObject({ success: true, data: { draft: null } });
  });

  it.each(['update', 'revise'] as const)('requires a draft for %s', (recommendation) => {
    expect(AssessorReplySchema.safeParse(buildReply({ recommendation })).success).toBe(false);
    expect(
      AssessorReplySchema.safeParse(buildReply({ recommendation, draft: { sections: [SECTION], children: [] } }))
        .success,
    ).toBe(true);
  });

  it('refuses a draft on a recommendation that does not draft one', () => {
    const reply = buildReply({ recommendation: 'keep', draft: { sections: [SECTION], children: [] } });

    expect(AssessorReplySchema.safeParse(reply).success).toBe(false);
  });

  it('requires children exactly for a split', () => {
    const split = buildReply({ recommendation: 'split', draft: { sections: [SECTION], children: [] } });
    const update = buildReply({ recommendation: 'update', draft: { sections: [SECTION], children: [CHILD] } });

    expect(AssessorReplySchema.safeParse(split).success).toBe(false);
    expect(AssessorReplySchema.safeParse(update).success).toBe(false);
    expect(AssessorReplySchema.safeParse({ ...split, draft: { sections: [SECTION], children: [CHILD] } }).success).toBe(
      true,
    );
  });

  it('strips the heading prefix and refuses a heading named twice', () => {
    const prefixed = buildReply({
      recommendation: 'update',
      draft: { sections: [{ heading: '## Context', body: 'Text' }], children: [] },
    });
    const repeated = buildReply({
      recommendation: 'update',
      draft: { sections: [SECTION, { heading: '## context', body: 'Other' }], children: [] },
    });

    expect(AssessorReplySchema.parse(prefixed).draft?.sections[0]?.heading).toBe('Context');
    expect(AssessorReplySchema.safeParse(repeated).success).toBe(false);
  });
});

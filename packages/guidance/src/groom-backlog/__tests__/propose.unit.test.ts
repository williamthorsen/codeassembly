import { describe, expect, it } from 'vitest';

import { proposeAction } from '../propose.ts';
import type { AssessorReply } from '../schemas.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import type { Escalation, InProgress } from '../types.ts';

const IN_PROGRESS: InProgress = { signal: 'branch', ref: '10', commitsAhead: 2, lastCommitAt: '2026-10-01T00:00:00Z' };
const DRAFT = { sections: [{ heading: 'Context', body: 'Moved.' }], children: [] };
const SPLIT_DRAFT = {
  sections: [{ heading: 'Problem', body: 'First piece.' }],
  children: [{ title: 'B', body: 'B.' }],
};

describe(proposeAction, () => {
  it.each([
    ['update', DRAFT],
    ['revise', DRAFT],
    ['split', SPLIT_DRAFT],
  ] as const)('applies the draft of %s', (recommendation, draft) => {
    expect(proposeAction(buildEscalation({ recommendation, draft }), undefined)).toStrictEqual({
      decision: recommendation,
    });
  });

  it.each(['close-complete', 'close-superseded'] as const)('closes on a high-confidence %s', (recommendation) => {
    expect(proposeAction(buildEscalation({ recommendation }), undefined)).toStrictEqual({ decision: recommendation });
  });

  it.each(['medium', 'low'] as const)('leaves a close at %s confidence', (confidence) => {
    expect(proposeAction(buildEscalation({ recommendation: 'close-complete', confidence }), undefined)).toStrictEqual({
      decision: 'leave',
    });
  });

  it('names the overlap survivor of a superseded close when the survivor is another ticket', () => {
    const escalation = buildEscalation({ recommendation: 'close-superseded' });

    expect(proposeAction(escalation, { reasons: [], survivor: 40, tickets: [10, 40] })).toStrictEqual({
      decision: 'close-superseded',
      supersededBy: 40,
    });
    expect(proposeAction(escalation, { reasons: [], survivor: 10, tickets: [10, 40] })).toStrictEqual({
      decision: 'close-superseded',
    });
  });

  it('keeps a keep with a non-baseline verdict', () => {
    expect(proposeAction(buildEscalation({ recommendation: 'keep' }), undefined)).toStrictEqual({ decision: 'keep' });
  });

  it('leaves an escalate', () => {
    expect(proposeAction(buildEscalation({ recommendation: 'escalate' }), undefined)).toStrictEqual({
      decision: 'leave',
    });
  });

  it.each([
    ['a high-confidence close', { recommendation: 'close-complete' }],
    ['an update', { recommendation: 'update', draft: DRAFT }],
  ] as const)('leaves %s on a ticket in progress', (_label, overrides) => {
    expect(proposeAction(buildEscalation(overrides, IN_PROGRESS), undefined)).toStrictEqual({ decision: 'leave' });
  });

  it('leaves an escalation without a stored reply', () => {
    const escalation = { ...buildEscalation({ recommendation: 'close-complete' }), reply: undefined };

    expect(proposeAction(escalation, undefined)).toStrictEqual({ decision: 'leave' });
  });
});

// region | Helpers

/** Builds an escalation of ticket 10 whose record and reply agree, with a high-confidence reply by default. */
function buildEscalation(overrides: Partial<AssessorReply>, inProgress: InProgress | null = null): Escalation {
  const reply = buildReply({ confidence: 'high', ...overrides });
  return {
    record: {
      run: 'r',
      kind: 'assessment',
      number: reply.number,
      assessedAt: '2026-10-01T00:00:00Z',
      sha: 'abc1234',
      ticketUpdatedAt: '2026-01-01T00:00:00Z',
      verdicts: reply.verdicts,
      recommendation: reply.recommendation,
      confidence: reply.confidence,
      reason: reply.reason,
      relatedTickets: [],
      inProgress,
      class: inProgress === null ? 'escalate' : 'escalate-in-progress',
      rule: null,
      dependsOn: null,
      overlaps: [],
    },
    reply,
  };
}

// endregion | Helpers

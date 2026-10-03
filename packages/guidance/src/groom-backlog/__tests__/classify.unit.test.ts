import { describe, expect, it } from 'vitest';

import { classify, isAllBaseline } from '../classify.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import type { InProgress } from '../types.ts';

const IN_PROGRESS: InProgress = {
  commitsAhead: 2,
  lastCommitAt: '2026-09-01T00:00:00Z',
  ref: '10-x',
  signal: 'branch',
};

const COMPLETE = buildReply({
  recommendation: 'close-complete',
  verdicts: { drift: 'none', relevance: 'relevant', progress: 'complete', advisability: null, complexity: null },
  evidence: { drift: [], relevance: [], progress: ['Done in src/a.ts'], advisability: [], complexity: [] },
});

describe(classify, () => {
  it('escalates an in-progress ticket before any other class', () => {
    expect(classify(COMPLETE, IN_PROGRESS)).toBe('escalate-in-progress');
  });

  it('auto-closes a high-confidence completion with complete progress and evidence', () => {
    expect(classify(COMPLETE, null)).toBe('auto-close-complete');
  });

  it('auto-closes a high-confidence completion on a verified reference', () => {
    const reply = buildReply({
      recommendation: 'close-complete',
      references: [{ ref: '#20', verified: true, note: 'Does the work' }],
    });

    expect(classify(reply, null)).toBe('auto-close-complete');
  });

  it('escalates a completion without verified evidence', () => {
    const reply = buildReply({
      recommendation: 'close-complete',
      references: [{ ref: '#20', verified: false, note: 'Another repository' }],
    });

    expect(classify(reply, null)).toBe('escalate');
  });

  it('escalates a completion below high confidence', () => {
    expect(classify({ ...COMPLETE, confidence: 'medium' }, null)).toBe('escalate');
  });

  it('auto-closes a high-confidence half-met reply', () => {
    const reply = buildReply({ recommendation: 'close-superseded', rule: 'half-met', remainder: ['Add a flag'] });

    expect(classify(reply, null)).toBe('auto-close-half-met');
  });

  it('escalates a half-met reply below high confidence', () => {
    const reply = buildReply({
      recommendation: 'close-superseded',
      rule: 'half-met',
      remainder: ['Add a flag'],
      confidence: 'medium',
    });

    expect(classify(reply, null)).toBe('escalate');
  });

  it('keeps silently an all-baseline keep', () => {
    expect(classify(buildReply(), null)).toBe('silent-keep');
  });

  it('escalates a keep with a non-baseline verdict', () => {
    const reply = buildReply({ verdicts: { ...buildReply().verdicts, drift: 'partial' } });

    expect(classify(reply, null)).toBe('escalate');
  });
});

describe(isAllBaseline, () => {
  it('ignores complexity, which does not have a baseline', () => {
    expect(isAllBaseline({ ...buildReply().verdicts, complexity: 'architectural' })).toBe(true);
  });
});

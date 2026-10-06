import { describe, expect, it } from 'vitest';

import { classify, type ClassifyContext, isAllBaseline, isEffectiveBaseline, isUmbrella } from '../classify.ts';
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

const IDLE: ClassifyContext = { inProgress: null, umbrella: false };

const PARTIAL_KEEP = buildReply({ verdicts: { ...buildReply().verdicts, progress: 'partial' } });

describe(classify, () => {
  it('escalates an in-progress completion rather than closing it', () => {
    expect(classify(COMPLETE, { inProgress: IN_PROGRESS, umbrella: false })).toBe('escalate-in-progress');
  });

  it('keeps silently an all-baseline keep of an in-progress ticket', () => {
    expect(classify(buildReply(), { inProgress: IN_PROGRESS, umbrella: false })).toBe('silent-keep');
  });

  it('escalates a non-baseline keep of an in-progress ticket', () => {
    expect(classify(PARTIAL_KEEP, { inProgress: IN_PROGRESS, umbrella: false })).toBe('escalate-in-progress');
  });

  it("keeps silently an umbrella's keep whose only non-baseline verdict is partial progress", () => {
    expect(classify(PARTIAL_KEEP, { inProgress: null, umbrella: true })).toBe('silent-keep');
  });

  it('escalates a keep with partial progress on a ticket that is not an umbrella', () => {
    expect(classify(PARTIAL_KEEP, IDLE)).toBe('escalate');
  });

  it('auto-closes a high-confidence completion with complete progress and evidence', () => {
    expect(classify(COMPLETE, IDLE)).toBe('auto-close-complete');
  });

  it('auto-closes a high-confidence completion on a verified reference', () => {
    const reply = buildReply({
      recommendation: 'close-complete',
      references: [{ ref: '#20', verified: true, note: 'Does the work' }],
    });

    expect(classify(reply, IDLE)).toBe('auto-close-complete');
  });

  it('escalates a completion without verified evidence', () => {
    const reply = buildReply({
      recommendation: 'close-complete',
      references: [{ ref: '#20', verified: false, note: 'Another repository' }],
    });

    expect(classify(reply, IDLE)).toBe('escalate');
  });

  it('escalates a completion below high confidence', () => {
    expect(classify({ ...COMPLETE, confidence: 'medium' }, IDLE)).toBe('escalate');
  });

  it('auto-closes a high-confidence half-met reply', () => {
    const reply = buildReply({ recommendation: 'close-superseded', rule: 'half-met', remainder: ['Add a flag'] });

    expect(classify(reply, IDLE)).toBe('auto-close-half-met');
  });

  it('escalates a half-met reply below high confidence', () => {
    const reply = buildReply({
      recommendation: 'close-superseded',
      rule: 'half-met',
      remainder: ['Add a flag'],
      confidence: 'medium',
    });

    expect(classify(reply, IDLE)).toBe('escalate');
  });

  it('keeps silently an all-baseline keep', () => {
    expect(classify(buildReply(), IDLE)).toBe('silent-keep');
  });

  it('escalates a keep with a non-baseline verdict', () => {
    const reply = buildReply({ verdicts: { ...buildReply().verdicts, drift: 'partial' } });

    expect(classify(reply, IDLE)).toBe('escalate');
  });
});

describe(isAllBaseline, () => {
  it('ignores complexity, which does not have a baseline', () => {
    expect(isAllBaseline({ ...buildReply().verdicts, complexity: 'architectural' })).toBe(true);
  });
});

describe(isEffectiveBaseline, () => {
  it('counts partial progress as baseline on an umbrella alone', () => {
    const verdicts = { ...buildReply().verdicts, progress: 'partial' };

    expect(isEffectiveBaseline(verdicts, true)).toBe(true);
    expect(isEffectiveBaseline(verdicts, false)).toBe(false);
  });

  it('keeps any other non-baseline verdict on an umbrella', () => {
    expect(isEffectiveBaseline({ ...buildReply().verdicts, progress: 'partial', drift: 'partial' }, true)).toBe(false);
  });
});

describe(isUmbrella, () => {
  const UMBRELLA_BODY = '## Acceptance criteria\n\n- [ ] Every child is closed.\n';

  it('recognizes a ticket with open children whose only unchecked criterion is that every child is closed', () => {
    expect(isUmbrella({ body: UMBRELLA_BODY, subIssues: { completed: 1, total: 3 } })).toBe(true);
  });

  it('rejects a ticket whose children are all closed', () => {
    expect(isUmbrella({ body: UMBRELLA_BODY, subIssues: { completed: 3, total: 3 } })).toBe(false);
  });

  it('rejects a ticket with open children whose criteria do not include that every child is closed', () => {
    expect(isUmbrella({ body: '- [x] The docs are written.', subIssues: { completed: 1, total: 3 } })).toBe(false);
  });

  it('rejects a ticket with another unchecked criterion', () => {
    const body = `${UMBRELLA_BODY}- [ ] The docs describe the new flow.\n`;

    expect(isUmbrella({ body, subIssues: { completed: 1, total: 3 } })).toBe(false);
  });
});

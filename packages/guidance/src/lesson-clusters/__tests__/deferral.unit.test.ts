import { describe, expect, it } from 'vitest';

import { findLatestDeferral, isDeferralActive, parseTriageReferenceDate } from '../deferral.ts';

const EARLY = '~/ai-artifacts/projects/codeassembly/feedback-triage/20261001-120000Z_triage_feedback-triage.md';
const LATE = '/elsewhere/20261015-083000Z_second-pass_feedback-triage.md';

describe(parseTriageReferenceDate, () => {
  it('reads the timestamp from a triage artifact path, whatever its directory', () => {
    expect(parseTriageReferenceDate(EARLY)).toBe('2026-10-01T12:00:00Z');
    expect(parseTriageReferenceDate('20261015-083000Z_x_feedback-triage.md')).toBe('2026-10-15T08:30:00Z');
  });

  it.each([
    'https://github.com/williamthorsen/codeassembly/issues/2206',
    '#2206',
    '20261001-120000Z_triage_plan.md',
    '20261001-120000Z_feedback-triage.md',
    '20261399-120000Z_triage_feedback-triage.md',
  ])('returns null for %s', (reference) => {
    expect(parseTriageReferenceDate(reference)).toBeNull();
  });
});

describe(findLatestDeferral, () => {
  it('returns the latest timestamp when every reference is a triage artifact', () => {
    expect(findLatestDeferral([LATE, EARLY])).toBe('2026-10-15T08:30:00Z');
  });

  it('returns null when any reference is something else', () => {
    expect(findLatestDeferral([EARLY, 'https://github.com/o/r/issues/1'])).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(findLatestDeferral([])).toBeNull();
  });
});

describe(isDeferralActive, () => {
  const deferredAt = '2026-10-01T12:00:00Z';

  it('holds before the interval has passed', () => {
    expect(isDeferralActive({ deferredAt, now: new Date('2026-10-30T12:00:00Z'), deferDays: 30 })).toBe(true);
  });

  it('lapses once the interval has passed', () => {
    expect(isDeferralActive({ deferredAt, now: new Date('2026-10-31T12:00:00Z'), deferDays: 30 })).toBe(false);
  });

  it('never holds for a zero-day interval', () => {
    expect(isDeferralActive({ deferredAt, now: new Date(deferredAt), deferDays: 0 })).toBe(false);
  });
});

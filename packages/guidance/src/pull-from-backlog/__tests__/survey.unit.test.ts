import { describe, expect, it } from 'vitest';

import type { Milestone } from '../../groom-backlog/fetch.ts';
import type { Issue } from '../../groom-backlog/types.ts';
import { buildIssue } from '../../test-utils/build-issue.ts';
import { PullConfigSchema } from '../schemas.ts';
import { buildSurvey, type Survey } from '../survey.ts';

const NOW = new Date('2026-10-01T00:00:00Z');

const SOONER = { dueOn: '2026-10-10T00:00:00Z', title: 'Sooner' };
const LATER = { dueOn: '2026-12-01T00:00:00Z', title: 'Later' };

const MILESTONES: Milestone[] = [
  { ...SOONER, number: 1, state: 'open' },
  { ...LATER, number: 2, state: 'open' },
];

describe(buildSurvey, () => {
  it('skips a milestone that holds only excluded tickets when it resolves Now', () => {
    const survey = surveyBacklog([
      buildIssue({ number: 1, milestone: SOONER, labels: ['status:blocked'] }),
      buildIssue({ number: 2, milestone: SOONER, labels: ['status:on-hold'] }),
      buildIssue({ number: 3, milestone: LATER }),
    ]);

    expect(survey.now).toMatchObject({ milestone: { title: 'Later' }, source: 'due-date' });
  });

  it('counts excluded tickets apart from Now, and never offers one', () => {
    const survey = surveyBacklog([
      buildIssue({ number: 1, milestone: SOONER }),
      buildIssue({ number: 2, milestone: SOONER, labels: ['status:blocked'] }),
      buildIssue({ number: 3, labels: ['status:on-hold'] }),
    ]);

    expect(survey.counts).toStrictEqual({ candidates: 1, excluded: 2, inNow: 1, open: 3 });
    expect(survey.candidates.map((candidate) => candidate.number)).toStrictEqual([1]);
    expect(survey.candidates.every((candidate) => candidate.inNow)).toBe(true);
  });

  it('offers a status-labelled ticket when excludeLabels is empty', () => {
    const survey = surveyBacklog([buildIssue({ number: 1, labels: ['status:blocked'] })], { excludeLabels: [] });

    expect(survey.counts.excluded).toBe(0);
    expect(survey.candidates.map((candidate) => candidate.number)).toStrictEqual([1]);
  });

  it('fills a short Now menu from the rest of the backlog, ranked after every Now candidate', () => {
    const survey = surveyBacklog([
      buildIssue({ number: 1, milestone: SOONER, createdAt: '2026-09-01T00:00:00Z' }),
      buildIssue({ number: 2, milestone: LATER, createdAt: '2026-03-01T00:00:00Z' }),
      buildIssue({ number: 3, createdAt: '2026-01-01T00:00:00Z', labels: ['priority:high'] }),
      buildIssue({ number: 4, createdAt: '2026-02-01T00:00:00Z', labels: ['status:blocked'] }),
    ]);

    expect(survey.candidates.map(({ inNow, number }) => ({ inNow, number }))).toStrictEqual([
      { inNow: true, number: 1 },
      { inNow: false, number: 3 },
      { inNow: false, number: 2 },
    ]);
    expect(survey.counts.candidates).toBe(1);
  });

  it('does not fill the menu when Now has --limit candidates', () => {
    const survey = surveyBacklog([buildIssue({ number: 1, milestone: SOONER }), buildIssue({ number: 2 })], {}, 1);

    expect(survey.candidates.map(({ inNow, number }) => ({ inNow, number }))).toStrictEqual([
      { inNow: true, number: 1 },
    ]);
  });

  it('does not fill the menu when Now is the whole backlog', () => {
    const survey = surveyBacklog([buildIssue({ number: 1 })]);

    expect(survey.now.milestone).toBeNull();
    expect(survey.candidates.map(({ inNow, number }) => ({ inNow, number }))).toStrictEqual([
      { inNow: true, number: 1 },
    ]);
  });
});

// region | Helpers

/** Builds the survey of `open` against the shared milestones, with `config` over the default `ticket.pull`. */
function surveyBacklog(open: Issue[], config: Record<string, unknown> = {}, limit = 3): Survey {
  return buildSurvey({
    config: PullConfigSchema.parse(config),
    inProgress: new Map(),
    limit,
    milestones: MILESTONES,
    now: NOW,
    nowFlag: undefined,
    open,
    records: [],
    user: 'me',
  });
}

// endregion | Helpers

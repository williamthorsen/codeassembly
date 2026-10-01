import { describe, expect, it } from 'vitest';

import { matchCrossReferences, type PullRequest } from '../cross-reference.ts';
import { buildIssue } from '../test-utils/build-issue.ts';

const REPO = 'owner/repo';

/** Builds a merged pull request that closes nothing. */
function buildPullRequest(overrides: Partial<PullRequest>): PullRequest {
  return {
    number: 100,
    title: 'Title',
    body: '',
    mergedAt: '2026-03-01T00:00:00Z',
    closingIssuesReferences: [],
    ...overrides,
  };
}

describe(matchCrossReferences, () => {
  const issue = buildIssue({ number: 72, createdAt: '2026-02-01T00:00:00Z' });

  it('reports a closing PR of this repository ahead of mentions, each kind oldest first', () => {
    const references = matchCrossReferences({
      commits: [{ sha: 'abc1234', subject: 'Fix the uploader (#72)', date: '2026-02-10T00:00:00-07:00' }],
      issues: [issue],
      nameWithOwner: REPO,
      pullRequests: [
        buildPullRequest({ number: 101, body: 'Relates to #72', mergedAt: '2026-04-01T00:00:00Z' }),
        buildPullRequest({
          number: 102,
          mergedAt: '2026-05-01T00:00:00Z',
          closingIssuesReferences: [{ number: 72, repository: { name: 'repo', owner: { login: 'owner' } } }],
        }),
      ],
    }).get(72);

    expect(references?.map((reference) => [reference.kind, reference.ref])).toStrictEqual([
      ['closing-pr', '#102'],
      ['pr-mention', '#101'],
      ['commit-mention', 'abc1234'],
    ]);
  });

  it("ignores another repository's closing reference and reference syntax", () => {
    const references = matchCrossReferences({
      commits: [],
      issues: [issue],
      nameWithOwner: REPO,
      pullRequests: [
        buildPullRequest({
          number: 103,
          body: 'See other/repo#72 and #720 and ##72',
          closingIssuesReferences: [{ number: 72, repository: { name: 'repo', owner: { login: 'other' } } }],
        }),
      ],
    }).get(72);

    expect(references).toStrictEqual([]);
  });

  it('ignores work merged before the ticket was created', () => {
    const references = matchCrossReferences({
      commits: [{ sha: 'abc1234', subject: 'Mention #72', date: '2026-01-01T00:00:00Z' }],
      issues: [issue],
      nameWithOwner: REPO,
      pullRequests: [buildPullRequest({ body: '#72', mergedAt: '2026-01-15T00:00:00Z' })],
    }).get(72);

    expect(references).toStrictEqual([]);
  });
});

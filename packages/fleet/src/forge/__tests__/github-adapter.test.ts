import { describe, expect, it } from 'vitest';

import { ABSENCE_RECHECK_INTERVAL, createGithubAdapter, type ProcessRunner } from '../github-adapter.ts';

const REPO = 'acme/app';

describe('createGithubAdapter', () => {
  it('normalizes an open pull request from the list into facts', async () => {
    const { run } = createRunner({
      prList: [composePr({ statusCheckRollup: [composeCheckRun('COMPLETED', 'SUCCESS')] })],
    });
    const adapter = createGithubAdapter({ runProcess: run });

    const { branchPrs } = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(branchPrs['feature-x']).toEqual({
      number: 12,
      title: 'Add the thing',
      url: 'https://github.com/acme/app/pull/12',
      state: 'open',
      isDraft: false,
      checks: 'passing',
      review: undefined,
    });
  });

  it.each([
    ['a single passing check', [composeCheckRun('COMPLETED', 'SUCCESS')], 'passing'],
    [
      'a failing check among passing ones',
      [composeCheckRun('COMPLETED', 'SUCCESS'), composeCheckRun('COMPLETED', 'FAILURE')],
      'failing',
    ],
    ['an in-progress check', [composeCheckRun('COMPLETED', 'SUCCESS'), composeCheckRun('IN_PROGRESS', '')], 'pending'],
    ['a legacy pending status context', [{ __typename: 'StatusContext', state: 'PENDING' }], 'pending'],
    ['a legacy failing status context', [{ __typename: 'StatusContext', state: 'ERROR' }], 'failing'],
  ])('rolls %s up to %s', async (_label, rollup, expected) => {
    const { run } = createRunner({ prList: [composePr({ statusCheckRollup: rollup })] });
    const adapter = createGithubAdapter({ runProcess: run });

    const { branchPrs } = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(branchPrs['feature-x']?.checks).toBe(expected);
  });

  it('reports no checks as undefined rather than a verdict', async () => {
    const { run } = createRunner({ prList: [composePr({ statusCheckRollup: [] })] });
    const adapter = createGithubAdapter({ runProcess: run });

    const { branchPrs } = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(branchPrs['feature-x']?.checks).toBeUndefined();
  });

  it.each([
    ['APPROVED', 'approved'],
    ['CHANGES_REQUESTED', 'changes-requested'],
    ['REVIEW_REQUIRED', 'review-required'],
    ['', undefined],
  ])('normalizes a %s review decision to %s', async (decision, expected) => {
    const { run } = createRunner({ prList: [composePr({ reviewDecision: decision })] });
    const adapter = createGithubAdapter({ runProcess: run });

    const { branchPrs } = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(branchPrs['feature-x']?.review).toBe(expected);
  });

  it('falls back to pr view for a branch absent from the open list, capturing a merged pull request', async () => {
    const { run } = createRunner({
      prList: [],
      prView: { 'feature-x': composePr({ state: 'MERGED' }) },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    const { branchPrs } = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(branchPrs['feature-x']?.state).toBe('merged');
  });

  it('caches a terminal pull request, skipping the pr view refetch on a later poll', async () => {
    const { run, calls } = createRunner({
      prList: [],
      prView: { 'feature-x': composePr({ state: 'MERGED' }) },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });
    const second = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(second.branchPrs['feature-x']?.state).toBe('merged');
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'view')).toHaveLength(1);
  });

  it('treats a branch with no pull request as a stable absence, skipping its re-probe on a later poll', async () => {
    const { run, calls } = createRunner({
      prList: [],
      prView: { 'feature-x': composeGhError('no pull requests found for branch "feature-x"') },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    const first = await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });
    await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });

    expect(first.branchPrs['feature-x']).toBeUndefined();
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'view')).toHaveLength(1);
  });

  it('re-probes a remembered absence on the recheck-interval boundary', async () => {
    const { run, calls } = createRunner({
      prList: [],
      prView: { 'feature-x': composeGhError('no pull requests found for branch "feature-x"') },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    for (let poll = 0; poll < ABSENCE_RECHECK_INTERVAL; poll += 1) {
      await adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] });
    }

    // The initial poll caches the absence; the interval-boundary poll clears it and re-probes — twice total, not once.
    expect(calls.filter((args) => args[0] === 'pr' && args[1] === 'view')).toHaveLength(2);
  });

  it('normalizes a ticket, lowercasing its state and flattening its labels to names', async () => {
    const { run } = createRunner({
      prList: [],
      issueView: { '7': composeIssue() },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    const { tickets } = await adapter.fetchRepoState({ repo: REPO, branches: [], ticketIds: ['7'] });

    expect(tickets['7']).toEqual({
      title: 'Fix the bug',
      state: 'open',
      url: 'https://github.com/acme/app/issues/7',
      createdAt: '2026-07-01T00:00:00Z',
      labels: ['bug', 'p1'],
    });
  });

  it('omits a ticket whose number resolves to no issue', async () => {
    const { run } = createRunner({
      prList: [],
      issueView: {
        '7': composeGhError('GraphQL: Could not resolve to an issue or pull request with the number of 7.'),
      },
    });
    const adapter = createGithubAdapter({ runProcess: run });

    const { tickets } = await adapter.fetchRepoState({ repo: REPO, branches: [], ticketIds: ['7'] });

    expect(tickets['7']).toBeUndefined();
  });

  it('surfaces malformed pr list output as a thrown error', async () => {
    const { run } = createRunner({ prList: 'this is not json {' });
    const adapter = createGithubAdapter({ runProcess: run });

    await expect(adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] })).rejects.toThrow();
  });

  it('surfaces a pull request missing required fields as a thrown error', async () => {
    const { run } = createRunner({ prList: [{ headRefName: 'feature-x', title: 'no number here' }] });
    const adapter = createGithubAdapter({ runProcess: run });

    await expect(adapter.fetchRepoState({ repo: REPO, branches: ['feature-x'], ticketIds: [] })).rejects.toThrow();
  });
});

// region | Helpers

/** A raw `gh` CheckRun rollup entry with the lifecycle `status` and result `conclusion` real output carries. */
function composeCheckRun(status: string, conclusion: string): Record<string, unknown> {
  return { __typename: 'CheckRun', name: 'ci', status, conclusion };
}

/** An error shaped like a failed `gh` invocation, carrying the `stderr` the runner rejects with. */
function composeGhError(stderr: string): Error {
  return Object.assign(new Error('gh exited non-zero'), { stderr });
}

/** A raw `gh` issue object with sensible defaults, overridable per field. */
function composeIssue(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Fix the bug',
    state: 'OPEN',
    url: 'https://github.com/acme/app/issues/7',
    createdAt: '2026-07-01T00:00:00Z',
    labels: [{ name: 'bug' }, { name: 'p1' }],
    ...overrides,
  };
}

/** A raw `gh` pull-request object with sensible defaults, overridable per field. */
function composePr(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 12,
    title: 'Add the thing',
    url: 'https://github.com/acme/app/pull/12',
    state: 'OPEN',
    isDraft: false,
    headRefName: 'feature-x',
    statusCheckRollup: [],
    reviewDecision: '',
    ...overrides,
  };
}

/** A fake `gh` runner dispatching on command arguments to the configured fixtures, recording every invocation. */
function createRunner(fixtures: {
  prList?: unknown;
  prView?: Record<string, unknown>;
  issueView?: Record<string, unknown>;
}): { run: ProcessRunner; calls: string[][] } {
  const calls: string[][] = [];
  const run: ProcessRunner = (_command, args) => {
    calls.push([...args]);
    if (args[0] === 'pr' && args[1] === 'list') {
      return respond(fixtures.prList);
    }
    if (args[0] === 'pr' && args[1] === 'view') {
      return respond(fixtures.prView?.[String(args[2])]);
    }
    if (args[0] === 'issue' && args[1] === 'view') {
      return respond(fixtures.issueView?.[String(args[2])]);
    }
    return Promise.reject(new Error(`unexpected gh invocation: ${args.join(' ')}`));
  };
  return { run, calls };
}

/** Resolves a fixture as `gh` stdout, or rejects it as a process failure; a string is returned verbatim for malformed cases. */
function respond(fixture: unknown): Promise<{ stdout: string; stderr: string }> {
  if (fixture === undefined) {
    return Promise.reject(new Error('gh route not configured for this test'));
  }
  if (fixture instanceof Error) {
    return Promise.reject(fixture);
  }
  const stdout = typeof fixture === 'string' ? fixture : JSON.stringify(fixture);
  return Promise.resolve({ stdout, stderr: '' });
}

// endregion | Helpers

import { describe, expect, it } from 'vitest';

import { buildIssue } from '../../test-utils/build-issue.ts';
import {
  extractUncheckedCriteria,
  type ParentSummary,
  readParentStatus,
  shouldOfferParentClose,
} from '../parent-status.ts';
import type { Issue } from '../types.ts';

const PARENT_BODY = [
  '## Acceptance criteria',
  '',
  '- [x] The schema is documented.',
  '- [ ] Every child is closed',
  '  - [ ] The migration guide is published.',
  '* [ ] Nothing else regresses',
].join('\n');

describe(extractUncheckedCriteria, () => {
  it('lists the unchecked items at any indentation, without the children criterion', () => {
    expect(extractUncheckedCriteria(PARENT_BODY)).toStrictEqual([
      'The migration guide is published.',
      'Nothing else regresses',
    ]);
  });

  it('drops the children criterion whatever its case and trailing period', () => {
    expect(extractUncheckedCriteria('- [ ] every child is closed.')).toStrictEqual([]);
  });
});

describe(shouldOfferParentClose, () => {
  const parent: ParentSummary = {
    completed: 3,
    number: 30,
    state: 'open',
    title: 'Umbrella',
    total: 3,
    uncheckedCriteria: [],
  };

  it('offers when the closed ticket was the last open child of an open parent', () => {
    expect(shouldOfferParentClose('closed', parent)).toBe(true);
  });

  it('does not offer while a child is open, the ticket is open, or the parent is closed or childless', () => {
    expect(shouldOfferParentClose('closed', { ...parent, completed: 2 })).toBe(false);
    expect(shouldOfferParentClose('open', parent)).toBe(false);
    expect(shouldOfferParentClose('closed', { ...parent, state: 'closed' })).toBe(false);
    expect(shouldOfferParentClose('closed', { ...parent, completed: 0, total: 0 })).toBe(false);
  });
});

describe(readParentStatus, () => {
  it('reads the ticket and its parent and offers to close the parent', async () => {
    const fetchIssue = buildFetch([
      buildIssue({ number: 20, state: 'closed', parent: 30 }),
      buildIssue({ number: 30, title: 'Umbrella', body: PARENT_BODY, subIssues: { completed: 3, total: 3 } }),
    ]);

    await expect(readParentStatus(fetchIssue, 20, noSleep)).resolves.toStrictEqual({
      offer: true,
      parent: {
        completed: 3,
        number: 30,
        state: 'open',
        title: 'Umbrella',
        total: 3,
        uncheckedCriteria: ['The migration guide is published.', 'Nothing else regresses'],
      },
      ticket: 20,
      ticketState: 'closed',
    });
  });

  it('reports a ticket without a parent without offering', async () => {
    const fetchIssue = buildFetch([buildIssue({ number: 20, state: 'closed' })]);

    await expect(readParentStatus(fetchIssue, 20, noSleep)).resolves.toStrictEqual({
      offer: false,
      parent: null,
      ticket: 20,
      ticketState: 'closed',
    });
  });

  it('reads an open ticket again until it reads as closed', async () => {
    const states: Array<Issue['state']> = ['open', 'closed'];
    const pauses: number[] = [];
    const fetchIssue = buildChildFetch(() => ({ state: states.shift() ?? 'closed' }));

    const status = await readParentStatus(fetchIssue, 20, (milliseconds) => {
      pauses.push(milliseconds);
      return Promise.resolve();
    });

    expect(status).toMatchObject({ offer: true, ticketState: 'closed' });
    expect(pauses).toStrictEqual([2_000]);
  });

  it('stops after three reads of a ticket that stays open, without offering', async () => {
    let reads = 0;
    const fetchIssue = buildChildFetch(() => {
      reads++;
      return {};
    });

    await expect(readParentStatus(fetchIssue, 20, noSleep)).resolves.toMatchObject({
      offer: false,
      ticketState: 'open',
    });
    expect(reads).toBe(3);
  });
});

// region | Helpers

/** Builds a fetcher that returns the issue of `issues` with the requested number. */
function buildFetch(issues: readonly Issue[]): (number: number) => Promise<Issue> {
  return (number) => {
    const issue = issues.find((candidate) => candidate.number === number);
    return issue === undefined ? Promise.reject(new Error(`fixture does not have #${number}`)) : Promise.resolve(issue);
  };
}

/**
 * Builds a fetcher for child #20 of parent #30, whose one child is closed; each read of #20 applies the overrides that
 * `readChild` returns.
 */
function buildChildFetch(readChild: () => Partial<Issue>): (number: number) => Promise<Issue> {
  return (number) =>
    Promise.resolve(
      buildIssue(
        number === 20 ? { number, parent: 30, ...readChild() } : { number, subIssues: { completed: 1, total: 1 } },
      ),
    );
}

/** Resolves at once, in place of the pause between reads. */
function noSleep(): Promise<void> {
  return Promise.resolve();
}

// endregion | Helpers

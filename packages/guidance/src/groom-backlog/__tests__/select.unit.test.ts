import { describe, expect, it } from 'vitest';

import { buildIssue } from '../../test-utils/build-issue.ts';
import { applySelectors, groupByScope, parseAge, readScope } from '../select.ts';

const NOW = new Date('2026-10-01T00:00:00Z');
const NO_SELECTORS = { excludeLabels: [], limit: undefined, olderThanDays: undefined, scopes: [] };

describe(applySelectors, () => {
  const issues = [
    buildIssue({ number: 1, labels: ['scope:agents'], updatedAt: '2026-09-30T00:00:00Z' }),
    buildIssue({ number: 2, labels: ['scope:kb', 'blocked'], updatedAt: '2026-06-01T00:00:00Z' }),
    buildIssue({ number: 3, labels: [], updatedAt: '2026-01-01T00:00:00Z' }),
  ];

  it('matches a scope given with or without its prefix', () => {
    const numbers = (scopes: string[]) =>
      applySelectors(issues, { ...NO_SELECTORS, scopes }, NOW).map((issue) => issue.number);

    expect(numbers(['agents'])).toStrictEqual([1]);
    expect(numbers(['scope:kb', 'agents'])).toStrictEqual([1, 2]);
  });

  it('drops an issue carrying an excluded label, matched exactly', () => {
    const selected = applySelectors(issues, { ...NO_SELECTORS, excludeLabels: ['blocked', 'scope'] }, NOW);

    expect(selected.map((issue) => issue.number)).toStrictEqual([1, 3]);
  });

  it('keeps an issue last updated before the --older-than cutoff', () => {
    const selected = applySelectors(issues, { ...NO_SELECTORS, olderThanDays: 30 }, NOW);

    expect(selected.map((issue) => issue.number)).toStrictEqual([2, 3]);
  });
});

describe(groupByScope, () => {
  it('orders the scopes alphabetically with the unscoped group last, each oldest first, in waves of four', () => {
    const issues = [
      buildIssue({ number: 9 }),
      ...[5, 4, 3, 2, 1].map((number) =>
        buildIssue({ number, labels: ['scope:kb'], createdAt: `2026-01-0${6 - number}T00:00:00Z` }),
      ),
      buildIssue({ number: 7, labels: ['scope:agents'] }),
    ];

    const groups = groupByScope(issues, new Map());

    expect(groups.map((group) => group.scope)).toStrictEqual(['agents', 'kb', null]);
    expect(groups[1]?.waves).toStrictEqual([[5, 4, 3, 2], [1]]);
  });
});

describe(readScope, () => {
  it('takes the first scope label alphabetically', () => {
    expect(readScope(buildIssue({ labels: ['scope:mcp', 'bug', 'scope:kb'] }))).toBe('kb');
  });
});

describe(parseAge, () => {
  it('reads days and weeks', () => {
    expect(parseAge('10d')).toBe(10);
    expect(parseAge('2w')).toBe(14);
  });

  it('refuses any other form', () => {
    expect(() => parseAge('3m')).toThrow('--older-than');
    expect(() => parseAge('0d')).toThrow('--older-than');
  });
});

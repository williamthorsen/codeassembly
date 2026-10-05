import { describe, expect, it } from 'vitest';

import { buildIssue } from '../../test-utils/build-issue.ts';
import { countByTier, findRelated, isPathLike } from '../related.ts';

const CLOSED = buildIssue({ number: 50, parent: 40, state: 'closed', title: 'Closed ticket' });

const FILES = ['packages/guidance/src/groom-backlog/cli.ts', 'docs/groom-backlog-helper.md'];

describe(findRelated, () => {
  it('finds a ticket that mentions the closed ticket or its closing PR as a token', () => {
    const open = [
      buildIssue({ number: 1, body: 'Follows #50.' }),
      buildIssue({ number: 2, comments: [{ author: 'a', body: 'Done in #70', createdAt: '' }] }),
      buildIssue({ number: 3, body: 'See #500 and owner/repo#50.' }),
    ];

    expect(findRelated({ closed: CLOSED, closingPr: 70, files: [], open })).toStrictEqual([
      { number: 1, tier: 'mention', tiers: ['mention'], title: 'Ticket' },
      { number: 2, tier: 'mention', tiers: ['mention'], title: 'Ticket' },
    ]);
  });

  it('finds a ticket that the closed ticket blocked', () => {
    const open = [buildIssue({ number: 1, blockedBy: [50] }), buildIssue({ number: 2, blockedBy: [51] })];

    expect(findRelated({ closed: CLOSED, closingPr: null, files: [], open })).toMatchObject([
      { number: 1, tier: 'blocked' },
    ]);
  });

  it("finds the closed ticket's parent and the parent's other open children", () => {
    const open = [
      buildIssue({ number: 40 }),
      buildIssue({ number: 41, parent: 40 }),
      buildIssue({ number: 42, parent: 39 }),
    ];

    expect(findRelated({ closed: CLOSED, closingPr: null, files: [], open })).toMatchObject([
      { number: 40, tier: 'family' },
      { number: 41, tier: 'family' },
    ]);
  });

  it('finds no family when the closed ticket does not have a parent', () => {
    const open = [buildIssue({ number: 41, parent: 40 })];

    expect(findRelated({ closed: { ...CLOSED, parent: null }, closingPr: null, files: [], open })).toStrictEqual([]);
  });

  it('finds a ticket whose text names a touched file by path, trailing segments, or basename', () => {
    const open = [
      buildIssue({ number: 1, body: 'Edit `packages/guidance/src/groom-backlog/cli.ts`.' }),
      buildIssue({ number: 2, body: 'The flag lives in groom-backlog/cli.ts' }),
      buildIssue({ number: 3, title: 'Update groom-backlog-helper.md' }),
      buildIssue({ number: 4, body: 'Touch the cli and the index.' }),
      buildIssue({ number: 5, body: 'Edit other/cli.ts.x' }),
    ];

    expect(findRelated({ closed: CLOSED, closingPr: 70, files: FILES, open }).map((c) => c.number)).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it('lists a ticket once under its first tier, with every tier that it matched', () => {
    const open = [buildIssue({ number: 41, parent: 40, blockedBy: [50], body: 'After #50, edit cli.ts.' })];

    expect(findRelated({ closed: CLOSED, closingPr: 70, files: FILES, open })).toStrictEqual([
      { number: 41, tier: 'mention', tiers: ['mention', 'blocked', 'family', 'file-overlap'], title: 'Ticket' },
    ]);
  });

  it('orders the candidates by first tier, then by number', () => {
    const open = [
      buildIssue({ number: 9, body: 'cli.ts' }),
      buildIssue({ number: 8, blockedBy: [50] }),
      buildIssue({ number: 7, body: '#50' }),
      buildIssue({ number: 6, body: '#50' }),
    ];

    expect(findRelated({ closed: CLOSED, closingPr: 70, files: FILES, open }).map((c) => c.number)).toStrictEqual([
      6, 7, 8, 9,
    ]);
  });

  it('never lists the closed ticket itself', () => {
    const open = [{ ...CLOSED, body: '#50 cli.ts', blockedBy: [50] }];

    expect(findRelated({ closed: CLOSED, closingPr: 70, files: FILES, open })).toStrictEqual([]);
  });

  it('without a closing PR, matches the ticket number alone and leaves file overlap empty', () => {
    const open = [buildIssue({ number: 1, body: '#70' }), buildIssue({ number: 2, body: 'Edit cli.ts' })];

    expect(findRelated({ closed: CLOSED, closingPr: null, files: FILES, open })).toStrictEqual([]);
  });
});

describe(isPathLike, () => {
  it('accepts a token with a slash or a short extension, and refuses a bare word', () => {
    expect(['cli.ts', 'docs/x.md', 'src/lib', 'a.yaml'].map(isPathLike)).toStrictEqual([true, true, true, true]);
    expect(['index', 'cli', 'v1.2.3.beta12'].map(isPathLike)).toStrictEqual([false, false, false]);
  });
});

describe(countByTier, () => {
  it('counts each candidate under its first tier', () => {
    const open = [buildIssue({ number: 1, body: '#50', blockedBy: [50] }), buildIssue({ number: 2, blockedBy: [50] })];

    expect(countByTier(findRelated({ closed: CLOSED, closingPr: null, files: [], open }))).toStrictEqual({
      mention: 1,
      blocked: 1,
      family: 0,
      'file-overlap': 0,
    });
  });
});

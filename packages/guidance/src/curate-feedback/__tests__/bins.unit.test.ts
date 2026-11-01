import { describe, expect, it } from 'vitest';

import { buildRecord, checkBins, type JudgedAssignment } from '../bins.ts';
import type { Assignment, BinsFile } from '../schemas.ts';

const SHA = 'a'.repeat(40);
const TICKET = 'https://github.com/acme/guide/issues/12';

/** Reports every file under `rules/` as present at the pin. */
const fileAtPin = (_root: string, _sha: string, file: string): boolean => file.startsWith('rules/');

describe(checkBins, () => {
  it('accepts a bins file that places every event once with what its bin needs', () => {
    expect(checkBins(judge(validBins()), fileAtPin)).toStrictEqual([]);
  });

  it('reports a missing, duplicated, and unknown event together', () => {
    const bins: BinsFile = {
      events: [
        { id: '01A', bin: 'kept' },
        { id: '01A', bin: 'kept' },
        { id: '01X', bin: 'kept' },
        { id: '01C', bin: 'kept' },
      ],
    };

    expect(checkBins(judge(bins), fileAtPin).map((violation) => [violation.event, violation.message])).toStrictEqual([
      ['01A', 'the event is placed more than once'],
      ['01X', 'the event is not in the assignment'],
      ['01B', 'the event is not placed in any bin'],
    ]);
  });

  it('reports a covered entry with an unpinned source, an absolute path, or a path absent at the pin', () => {
    const bins: BinsFile = {
      events: [
        { id: '01A', bin: 'covered', source: 'other/repo', path: 'rules/a.md', reason: 'States it.' },
        { id: '01B', bin: 'covered', source: 'acme/guide', path: '/rules/a.md', reason: 'States it.' },
        { id: '01C', bin: 'covered', source: 'acme/guide', path: 'docs/gone.md', reason: 'States it.' },
      ],
    };

    expect(checkBins(judge(bins), fileAtPin).map((violation) => violation.event)).toStrictEqual(['01A', '01B', '01C']);
  });

  it('reports a duplicate that does not name a reference entry, and a non-kept entry without a reason', () => {
    const bins: BinsFile = {
      events: [
        { id: '01A', bin: 'duplicate', duplicateOf: '01Q', reason: 'Same lesson.' },
        { id: '01B', bin: 'obsolete' },
        { id: '01C', bin: 'kept' },
      ],
    };

    expect(checkBins(judge(bins), fileAtPin).map((violation) => violation.message)).toStrictEqual([
      'a duplicate must name a reference entry (got "01Q")',
      'an entry in the obsolete bin needs a reason',
    ]);
  });
});

describe(buildRecord, () => {
  it('composes the permalink, copies the duplicate target references, and groups the marks', () => {
    const record = buildRecord([judge(validBins())]);

    expect(record.counts).toStrictEqual({ covered: 1, duplicate: 1, obsolete: 1, kept: 0 });
    expect(record.events[0]?.reference).toBe(`https://github.com/acme/guide/blob/${SHA}/rules/a.md`);
    expect(record.marks).toStrictEqual({
      addressedBy: [
        { references: [`https://github.com/acme/guide/blob/${SHA}/rules/a.md`], eventIds: ['01A'], result: null },
        { references: [TICKET], eventIds: ['01B'], result: null },
      ],
      obsolete: { eventIds: ['01C'], result: null },
    });
  });
});

// region | Helpers

/** Pairs the fixture assignment with `bins`. */
function judge(bins: BinsFile): JudgedAssignment {
  return { assignment: makeAssignment(), bins, file: '/work/bins-01.json' };
}

/** Builds an assignment of one cluster with three events, one pin, and one reference entry. */
function makeAssignment(): Assignment {
  return {
    store: 'fixture',
    clusters: [
      {
        id: 'headings',
        lesson: 'Headings use sentence case.',
        events: ['01A', '01B', '01C'].map((id) => ({ id, summary: `Summary ${id}`, excerpt: '' })),
      },
    ],
    references: [{ id: '01Z', summary: 'Z', excerpt: '', references: [TICKET] }],
    pins: [{ repo: 'acme/guide', root: '/repos/guide', branch: 'main', sha: SHA, sources: ['/repos/guide/content'] }],
  };
}

/** Returns bins that place each fixture event in a different non-kept bin. */
function validBins(): BinsFile {
  return {
    events: [
      { id: '01A', bin: 'covered', source: 'acme/guide', path: 'rules/a.md', reason: 'States it.' },
      { id: '01B', bin: 'duplicate', duplicateOf: '01Z', reason: 'Same lesson.' },
      { id: '01C', bin: 'obsolete', reason: 'The skill was removed.' },
    ],
  };
}

// endregion | Helpers

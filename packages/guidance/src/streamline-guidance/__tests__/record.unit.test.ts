import { describe, expect, it } from 'vitest';

import { composeRecord, parseFold, parseRecord, stringifyRecord } from '../record.ts';
import type { DeclinedCut, GuidanceRecord } from '../types.ts';

const GUIDE = 'docs/guide.md';
const GUIDE_CONTENT = 'Intro sentence.\n\nA hedge that says little.\n\nA rule that   stays.\n';
const NO_BYTES: ReadonlyMap<string, number> = new Map();

describe(composeRecord, () => {
  it("adds a run's declined cuts, dated to the run", () => {
    const record = composeRecord(
      { declined: [], reviewed: [] },
      {
        date: '2026-09-10',
        declined: [{ file: GUIDE, phrase: 'Intro sentence.', class: 'conservative' }],
        reviewed: [],
      },
      readGuide,
      NO_BYTES,
    );

    expect(record.declined).toStrictEqual([
      { file: GUIDE, phrase: 'Intro sentence.', class: 'conservative', 'declined-at': '2026-09-10' },
    ]);
  });

  it('if a cut is declined again, replaces the entry that it repeats', () => {
    const prior: GuidanceRecord = {
      declined: [{ file: GUIDE, phrase: 'A rule that stays.', class: 'moderate', 'declined-at': '2026-09-01' }],
      reviewed: [],
    };

    const record = composeRecord(
      prior,
      {
        date: '2026-09-10',
        declined: [{ file: GUIDE, phrase: 'A rule\nthat stays.', class: 'aggressive' }],
        reviewed: [],
      },
      readGuide,
      NO_BYTES,
    );

    expect(record.declined).toStrictEqual([
      { file: GUIDE, phrase: 'A rule\nthat stays.', class: 'aggressive', 'declined-at': '2026-09-10' },
    ]);
  });

  it('drops an entry whose file no longer contains its phrase or no longer exists', () => {
    const prior: GuidanceRecord = {
      declined: [
        { file: GUIDE, phrase: 'A hedge that says little.', class: 'conservative', 'declined-at': '2026-09-01' },
        { file: GUIDE, phrase: 'A sentence since removed.', class: 'conservative', 'declined-at': '2026-09-01' },
        { file: 'docs/deleted.md', phrase: 'Anything.', class: 'moderate', 'declined-at': '2026-09-01' },
      ],
      reviewed: [],
    };

    const record = composeRecord(prior, { date: '2026-09-10', declined: [], reviewed: [] }, readGuide, NO_BYTES);

    expect(record.declined.map((entry) => entry.phrase)).toStrictEqual(['A hedge that says little.']);
  });

  it("records each reviewed file with the run's date and its measured bytes, replacing an earlier review", () => {
    const prior: GuidanceRecord = {
      declined: [],
      reviewed: [{ file: GUIDE, 'reviewed-at': '2026-09-01', 'deployed-bytes': 900 }],
    };

    const record = composeRecord(
      prior,
      { date: '2026-09-10', declined: [], reviewed: [GUIDE] },
      readGuide,
      new Map([[GUIDE, 640]]),
    );

    expect(record.reviewed).toStrictEqual([{ file: GUIDE, 'reviewed-at': '2026-09-10', 'deployed-bytes': 640 }]);
  });

  it('records a reviewed file without measured bytes by its date alone', () => {
    const record = composeRecord(
      { declined: [], reviewed: [] },
      { date: '2026-09-10', declined: [], reviewed: [GUIDE] },
      readGuide,
      NO_BYTES,
    );

    expect(record.reviewed).toStrictEqual([{ file: GUIDE, 'reviewed-at': '2026-09-10' }]);
  });

  it('drops the review of a file that no longer exists', () => {
    const prior: GuidanceRecord = {
      declined: [],
      reviewed: [{ file: 'docs/deleted.md', 'reviewed-at': '2026-09-01', 'deployed-bytes': 10 }],
    };

    const record = composeRecord(prior, { date: '2026-09-10', declined: [], reviewed: [] }, readGuide, NO_BYTES);

    expect(record.reviewed).toStrictEqual([]);
  });
});

describe(parseFold, () => {
  it('if a declined cut does not name a class, throws', () => {
    const json = JSON.stringify({
      date: '2026-09-10',
      declined: [{ file: GUIDE, phrase: 'Intro sentence.' }],
      reviewed: [],
    });

    expect(() => parseFold(json)).toThrow(/Invalid fold: declined\.0\.class/);
  });
});

describe(stringifyRecord, () => {
  it('renders the same YAML whatever the order of the entries, and parses back to them', () => {
    const entries: DeclinedCut[] = [
      { file: 'docs/b.md', phrase: 'Second file.', class: 'moderate', 'declined-at': '2026-09-10' },
      { file: 'docs/a.md', phrase: 'Zeta phrase.', class: 'conservative', 'declined-at': '2026-09-10' },
      { file: 'docs/a.md', phrase: 'Alpha phrase.', class: 'aggressive', 'declined-at': '2026-09-09' },
    ];

    const reviews = [
      { file: 'docs/b.md', 'reviewed-at': '2026-09-10', 'deployed-bytes': 20 },
      { file: 'docs/a.md', 'reviewed-at': '2026-09-10' },
    ];

    const forward = stringifyRecord({ declined: entries, reviewed: reviews });
    const reversed = stringifyRecord({ declined: entries.toReversed(), reviewed: reviews.toReversed() });

    expect(reversed).toBe(forward);
    expect(parseRecord(forward).declined.map((entry) => entry.phrase)).toStrictEqual([
      'Alpha phrase.',
      'Zeta phrase.',
      'Second file.',
    ]);
    expect(parseRecord(forward).reviewed).toStrictEqual(reviews.toReversed());
  });

  it('writes both sections when they are empty, and parses a record holding only declined cuts', () => {
    expect(stringifyRecord({ declined: [], reviewed: [] })).toBe('declined: []\nreviewed: []\n');
    expect(parseRecord('declined: []\n')).toStrictEqual({ declined: [], reviewed: [] });
  });
});

// region | Helpers

/** Returns the guide's content for its path, and undefined for any other file, which stands for a deleted one. */
function readGuide(file: string): string | undefined {
  return file === GUIDE ? GUIDE_CONTENT : undefined;
}

// endregion | Helpers

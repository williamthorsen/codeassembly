import { describe, expect, it } from 'vitest';

import { composeRecord, parseFold, parseRecord, stringifyRecord } from '../record.ts';
import type { DeclinedCut, DeclineRecord } from '../types.ts';

const GUIDE = 'docs/guide.md';
const GUIDE_CONTENT = 'Intro sentence.\n\nA hedge that says little.\n\nA rule that   stays.\n';

describe(composeRecord, () => {
  it("adds a run's declined cuts, dated to the run", () => {
    const record = composeRecord(
      { declined: [] },
      { declinedAt: '2026-09-10', declined: [{ file: GUIDE, phrase: 'Intro sentence.', class: 'conservative' }] },
      readGuide,
    );

    expect(record.declined).toStrictEqual([
      { file: GUIDE, phrase: 'Intro sentence.', class: 'conservative', 'declined-at': '2026-09-10' },
    ]);
  });

  it('if a cut is declined again, replaces the entry that it repeats', () => {
    const prior: DeclineRecord = {
      declined: [{ file: GUIDE, phrase: 'A rule that stays.', class: 'moderate', 'declined-at': '2026-09-01' }],
    };

    const record = composeRecord(
      prior,
      { declinedAt: '2026-09-10', declined: [{ file: GUIDE, phrase: 'A rule\nthat stays.', class: 'aggressive' }] },
      readGuide,
    );

    expect(record.declined).toStrictEqual([
      { file: GUIDE, phrase: 'A rule\nthat stays.', class: 'aggressive', 'declined-at': '2026-09-10' },
    ]);
  });

  it('drops an entry whose file no longer contains its phrase or no longer exists', () => {
    const prior: DeclineRecord = {
      declined: [
        { file: GUIDE, phrase: 'A hedge that says little.', class: 'conservative', 'declined-at': '2026-09-01' },
        { file: GUIDE, phrase: 'A sentence since removed.', class: 'conservative', 'declined-at': '2026-09-01' },
        { file: 'docs/deleted.md', phrase: 'Anything.', class: 'moderate', 'declined-at': '2026-09-01' },
      ],
    };

    const record = composeRecord(prior, { declinedAt: '2026-09-10', declined: [] }, readGuide);

    expect(record.declined.map((entry) => entry.phrase)).toStrictEqual(['A hedge that says little.']);
  });
});

describe(parseFold, () => {
  it('if a declined cut names no class, throws', () => {
    const json = JSON.stringify({ declinedAt: '2026-09-10', declined: [{ file: GUIDE, phrase: 'Intro sentence.' }] });

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

    const forward = stringifyRecord({ declined: entries });
    const reversed = stringifyRecord({ declined: entries.toReversed() });

    expect(reversed).toBe(forward);
    expect(parseRecord(forward).declined.map((entry) => entry.phrase)).toStrictEqual([
      'Alpha phrase.',
      'Zeta phrase.',
      'Second file.',
    ]);
  });
});

// region | Helpers

/** Returns the guide's content for its path, and undefined for any other file, which stands for a deleted one. */
function readGuide(file: string): string | undefined {
  return file === GUIDE ? GUIDE_CONTENT : undefined;
}

// endregion | Helpers

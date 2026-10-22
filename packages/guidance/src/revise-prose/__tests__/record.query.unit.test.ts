import { describe, expect, it } from 'vitest';

import { containsPhrase, isStaleRejection, listUnsweptRules, seedFiles, selectPriorRejections } from '../record.ts';
import { coverage, EMPTY, hasEmDashDetector, HASH, rejection } from '../test-utils/record-fixtures.ts';
import type { ProseRecord } from '../types.ts';

describe(containsPhrase, () => {
  it('finds a phrase reported verbatim across comment markers, which extraction strips', () => {
    const text = { prose: 'Resolves the source it names.', content: '/**\n * Resolves the source\n * it names.\n */' };

    expect(containsPhrase(text, 'the source\n * it names')).toBe(true);
  });

  it('does not find a phrase that neither the prose nor the content contains', () => {
    const text = { prose: 'Resolves the source that it names.', content: '// Resolves the source that it names.' };

    expect(containsPhrase(text, 'the source it names')).toBe(false);
  });
});

describe(listUnsweptRules, () => {
  const versions = new Map([
    ['em-dash', '1'],
    ['sentence-case', '1'],
  ]);

  it('lists every rule for a file whose prose hash differs from the recorded one', () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', 'f'.repeat(16))).toStrictEqual([
      'em-dash',
      'sentence-case',
    ]);
  });

  it('lists every rule for a file without a hash, or one that the file table does not list', () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', undefined)).toHaveLength(2);
    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/new.md', HASH)).toHaveLength(2);
  });

  it('lists a rule that the file entry does not name, though its roots contain the file', () => {
    const record: ProseRecord = {
      ...coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage() }),
      files: { 'docs/guide.md': { hash: HASH, rules: ['em-dash'] } },
    };

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual([
      'sentence-case',
    ]);
  });

  it("returns an empty list for a file under a recorded root at each rule's current version, with each available detector having run", () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage({ detected: false }) });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual([]);
  });

  it('lists a rule whose recorded sweep did not run the detector that the helper now has', () => {
    const record = coveredRecord({ 'em-dash': coverage({ detected: false }), 'sentence-case': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual(['em-dash']);
  });

  it('lists a rule recorded at another version alone, the other rule still covering the file', () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage({ version: '2' }) });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual([
      'sentence-case',
    ]);
  });

  it('lists a rule that the record does not name', () => {
    const record = coveredRecord({ 'em-dash': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual([
      'sentence-case',
    ]);
  });

  it('lists every rule for a file outside every recorded root', () => {
    const record = coveredRecord({
      'em-dash': coverage({ roots: ['docs'] }),
      'sentence-case': coverage({ detected: false, roots: ['docs'] }),
    });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'src/notes.md', HASH)).toStrictEqual([
      'em-dash',
      'sentence-case',
    ]);
  });

  it('returns an empty list for a run that does not version any rule', () => {
    const record = coveredRecord({ 'em-dash': coverage() });

    expect(listUnsweptRules(record, new Map(), hasEmDashDetector, 'docs/guide.md', HASH)).toStrictEqual([]);
  });
});

describe(isStaleRejection, () => {
  it('reports a rejection recorded at an older version of its rule as stale', () => {
    expect(isStaleRejection(rejection({ 'rule-version': '0' }), new Map([['em-dash', '1']]))).toBe(true);
  });

  it('reports a rejection recorded at the current version of its rule as current', () => {
    expect(isStaleRejection(rejection(), new Map([['em-dash', '1']]))).toBe(false);
  });

  it('reports a rejection whose rule the run does not version as current, the run not having a version to compare', () => {
    expect(isStaleRejection(rejection({ 'rule-version': '0' }), new Map())).toBe(false);
  });
});

describe(selectPriorRejections, () => {
  const versions = new Map([['em-dash', '1']]);

  it('selects a live rejection over a file that the sweep read', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([
      { rule: 'em-dash', file: 'docs/guide.md', phrase: 'The cache is cold' },
    ]);
  });

  it('selects a rejection under a rule for which the helper does not have a detector', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ rule: 'plain-speech', 'rule-version': '6' })] };

    expect(selectPriorRejections(record, new Map([['plain-speech', '6']]), ['docs/guide.md'])).toHaveLength(1);
  });

  it('withholds a rejection recorded at an older version of its rule, so its site is judged afresh', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ 'rule-version': '0' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection whose rule the run does not version, since the run does not have a version that would re-open it', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ rule: 'sentence-case' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection over a file that the sweep did not read', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/other.md'])).toStrictEqual([]);
  });

  it("reports the site alone, the version and ground being the record's own bookkeeping", () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };
    const [selected] = selectPriorRejections(record, versions, ['docs/guide.md']);

    expect(Object.keys(selected ?? {}).toSorted()).toStrictEqual(['file', 'phrase', 'rule']);
  });
});

describe(seedFiles, () => {
  it('records each file at its hash for the rules whose roots contain it, and skips a file under no root', () => {
    const record: ProseRecord = {
      ...EMPTY,
      rules: { 'em-dash': coverage({ roots: ['docs'] }), 'sentence-case': coverage({ roots: ['.'] }) },
    };

    const seeded = seedFiles(
      record,
      new Map([
        ['docs/a.md', HASH],
        ['src/b.ts', HASH],
      ]),
    );

    expect(seeded.files).toStrictEqual({
      'docs/a.md': { hash: HASH, rules: ['em-dash', 'sentence-case'] },
      'src/b.ts': { hash: HASH, rules: ['sentence-case'] },
    });
    expect(
      seedFiles({ ...EMPTY, rules: { 'em-dash': coverage({ roots: ['docs'] }) } }, new Map([['src/b.ts', HASH]])).files,
    ).toStrictEqual({});
  });

  it('returns a record that already has a file table unchanged', () => {
    const record: ProseRecord = { ...EMPTY, files: {} };

    expect(seedFiles(record, new Map([['docs/a.md', HASH]]))).toBe(record);
  });
});

// region | Helpers

/**
 * Builds a record containing the given coverage, with `docs/guide.md` and `src/notes.md` recorded at {@link HASH} for
 * every rule that it names, and an empty rejection list.
 */
function coveredRecord(rules: ProseRecord['rules']): ProseRecord {
  const fileCoverage = { hash: HASH, rules: Object.keys(rules).toSorted() };
  return { rules, files: { 'docs/guide.md': fileCoverage, 'src/notes.md': fileCoverage }, rejections: [] };
}

// endregion | Helpers

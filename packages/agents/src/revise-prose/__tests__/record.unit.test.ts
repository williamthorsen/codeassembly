import { describe, expect, it } from 'vitest';

import {
  applyRejections,
  composeRecord,
  isStaleRejection,
  parseRecord,
  RECORD_PATH,
  selectPriorRejections,
  stringifyRecord,
} from '../record.ts';
import type {
  Candidate,
  FoldRejection,
  ObjectRelativeCandidate,
  ProseRecord,
  RecordedRejection,
  RunFold,
} from '../types.ts';

const EMPTY: ProseRecord = { units: {}, rejections: [] };

describe(parseRecord, () => {
  it('reads an absent record as the empty one', () => {
    expect(parseRecord('')).toStrictEqual(EMPTY);
  });

  it('reads a record naming units alone', () => {
    const record = parseRecord(
      'units:\n  writing:\n    version: "2"\n    swept-at: 2026-09-02\n    roots:\n      - "."\n',
    );

    expect(record.units['writing']).toStrictEqual({ version: '2', 'swept-at': '2026-09-02', roots: ['.'] });
    expect(record.rejections).toStrictEqual([]);
  });

  it('refuses a record whose date is not an ISO calendar date', () => {
    expect(() =>
      parseRecord('units:\n  writing:\n    version: "2"\n    swept-at: yesterday\n    roots: ["."]\n'),
    ).toThrow(/ISO calendar date/);
  });

  it('reads a rejection under a rule the helper holds no detector for', () => {
    const record = parseRecord(rejectionYaml({ rule: 'plain-speech', unit: 'plain-speech' }));

    expect(record.rejections[0]?.rule).toBe('plain-speech');
  });

  it('refuses a rejection whose rule is not a kebab-case name', () => {
    expect(() => parseRecord(rejectionYaml({ rule: 'Plain Speech' }))).toThrow(/kebab-case/);
  });

  it('reads a record still holding a hash, which the schema no longer defines', () => {
    const record = parseRecord(rejectionYaml({ hash: '0123456789abcdef' }));

    expect(record.rejections[0]).not.toHaveProperty('hash');
  });

  it('names the record in its failure, so a malformed file is findable', () => {
    expect(() => parseRecord('units: [not, a, map]')).toThrow(new RegExp(RECORD_PATH.replace('.', String.raw`\.`)));
  });
});

describe(applyRejections, () => {
  const versions = new Map([['writing', '2']]);

  it('suppresses a site whose recorded phrase runs wider than the span reported by the detector', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'rule it names' })],
      { units: {}, rejections: [rejection({ phrase: 'whatever rule it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site whose recorded phrase sits inside the span reported by the detector', () => {
    const sentence = 'The cache is cold, so the transport reconnects.';
    const applied = applyRejections(
      [{ rule: 'em-dash', file: 'docs/guide.md', line: 3, phrase: sentence, sentence }],
      { units: {}, rejections: [rejection({ rule: 'em-dash', phrase: 'so the transport reconnects' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across an inline code span, which the detector elides and the record holds whole', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'enumerate their «codespan» reasons' })],
      { units: {}, rejections: [rejection({ phrase: 'enumerate their `unavailable` reasons' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across a reflow, so a repair that only rewraps a line keeps the rejection', () => {
    const applied = applyRejections(
      [candidate()],
      { units: {}, rejections: [rejection({ phrase: 'the source\n  that it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across a Unicode normalization difference', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'the caf\u{E9} that it names' })],
      { units: {}, rejections: [rejection({ phrase: 'the cafe\u{301} that it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('leaves a site under a rule that the rejection does not name, one verdict settling one rule', () => {
    const applied = applyRejections(
      [candidate()],
      { units: {}, rejections: [rejection({ rule: 'em-dash' })] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('leaves a site in a file that the rejection does not name', () => {
    const applied = applyRejections(
      [candidate()],
      { units: {}, rejections: [rejection({ file: 'docs/other.md' })] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('leaves a site whose span the recorded phrase does not reach', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'the level against which it is probed' })],
      { units: {}, rejections: [rejection()] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('marks a site recorded at an older unit version stale, which re-opens it for review', () => {
    const applied = applyRejections(
      [candidate()],
      { units: {}, rejections: [rejection({ 'unit-version': '1' })] },
      versions,
    );

    expect(applied).toStrictEqual([{ ...candidate(), stale: true }]);
  });

  it('suppresses a site that a live rejection covers, whatever a stale one recorded beside it holds', () => {
    const applied = applyRejections(
      [candidate()],
      {
        units: {},
        rejections: [
          rejection({ 'unit-version': '1', phrase: 'the source that it names, as an earlier sweep left it' }),
          rejection(),
        ],
      },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });
});

describe(composeRecord, () => {
  it('records a unit the run covered', () => {
    const record = composeRecord(EMPTY, fold({ units: { writing: { version: '2', roots: ['.'] } } }));

    expect(record.units['writing']).toStrictEqual({ version: '2', 'swept-at': '2026-09-02', roots: ['.'] });
  });

  it('sorts the roots it records, so a rewrite does not depend on the order of the run', () => {
    const record = composeRecord(EMPTY, fold({ units: { writing: { version: '2', roots: ['src', 'docs'] } } }));

    expect(record.units['writing']?.roots).toStrictEqual(['docs', 'src']);
  });

  it("joins a narrowed run's roots onto those already recorded at the same version", () => {
    const prior: ProseRecord = {
      units: { writing: { version: '2', 'swept-at': '2026-09-01', roots: ['docs'] } },
      rejections: [],
    };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['src'] } } }));

    expect(record.units['writing']).toStrictEqual({ version: '2', 'swept-at': '2026-09-02', roots: ['docs', 'src'] });
  });

  it('drops a joined root that another one already contains', () => {
    const prior: ProseRecord = {
      units: { writing: { version: '2', 'swept-at': '2026-09-01', roots: ['.'] } },
      rejections: [],
    };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['docs'] } } }));

    expect(record.units['writing']?.roots).toStrictEqual(['.']);
  });

  it('replaces the recorded roots when the version moves, the earlier sweep covering a rule that has changed', () => {
    const prior: ProseRecord = {
      units: { writing: { version: '1', 'swept-at': '2026-09-01', roots: ['.'] } },
      rejections: [],
    };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['docs'] } } }));

    expect(record.units['writing']?.roots).toStrictEqual(['docs']);
  });

  it('leaves a unit the run did not name untouched', () => {
    const prior: ProseRecord = {
      units: { 'plain-speech': { version: '1', 'swept-at': '2026-01-01', roots: ['.'] } },
      rejections: [rejection({ unit: 'plain-speech', 'unit-version': '1' })],
    };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['.'] } } }));

    expect(record.units['plain-speech']).toStrictEqual(prior.units['plain-speech']);
    expect(record.rejections).toContainEqual(prior.rejections[0]);
  });

  it("replaces a swept unit's rejections at the same version, a site not re-rejected being withdrawn", () => {
    const kept = rejection({ file: 'docs/a.md' });
    const withdrawn = rejection({ file: 'docs/b.md', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { units: {}, rejections: [kept, withdrawn] };

    const record = composeRecord(
      prior,
      fold({
        units: { writing: { version: '2', roots: ['.'] } },
        rejections: [foldRejection({ file: 'docs/a.md' })],
      }),
    );

    expect(record.rejections).toStrictEqual([kept]);
  });

  it('records the phrase reported by the fold, at the version of the unit that it names', () => {
    const record = composeRecord(
      { units: {}, rejections: [] },
      fold({
        units: { writing: { version: '2', roots: ['.'] } },
        rejections: [foldRejection({ phrase: 'the ticket that the branch name encodes' })],
      }),
    );

    expect(record.rejections[0]).toMatchObject({
      phrase: 'the ticket that the branch name encodes',
      'unit-version': '2',
    });
  });

  it('refuses a fold whose rejection names a unit it does not cover', () => {
    expect(() =>
      composeRecord(
        { units: {}, rejections: [] },
        fold({
          units: { writing: { version: '2', roots: ['.'] } },
          rejections: [foldRejection({ unit: 'plain-speech' })],
        }),
      ),
    ).toThrow(/which the fold does not cover/);
  });

  it('retires the entry it supersedes across a reflow, a rewrapped line naming the same site', () => {
    const older = rejection({ 'unit-version': '1', phrase: 'the source\n  that it names' });
    const prior: ProseRecord = { units: {}, rejections: [older] };

    const record = composeRecord(
      prior,
      fold({ units: { writing: { version: '2', roots: ['.'] } }, rejections: [foldRejection()] }),
    );

    expect(record.rejections).toHaveLength(1);
    expect(record.rejections[0]).toMatchObject({ 'unit-version': '2' });
  });

  it('holds one entry per site when a bump is followed by a re-rejection of the same site', () => {
    const older = rejection({ 'unit-version': '1' });
    const prior: ProseRecord = { units: {}, rejections: [older] };

    const record = composeRecord(
      prior,
      fold({ units: { writing: { version: '2', roots: ['.'] } }, rejections: [foldRejection()] }),
    );

    expect(record.rejections).toHaveLength(1);
    expect(record.rejections[0]).toMatchObject({ 'unit-version': '2' });
  });

  it('carries forward a rejection outside the roots swept by the run, which the run never revisited', () => {
    const inside = rejection({ file: 'docs/a.md' });
    const outside = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { units: {}, rejections: [inside, outside] };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['docs'] } } }));

    expect(record.rejections).toStrictEqual([outside]);
  });

  it('withdraws a rejection anywhere in the repository when the run swept the whole of it', () => {
    const inside = rejection({ file: 'docs/a.md' });
    const outside = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { units: {}, rejections: [inside, outside] };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['.'] } } }));

    expect(record.rejections).toStrictEqual([]);
  });

  it('keeps a rejection recorded at an older version, a bump being a review rather than a deletion', () => {
    const older = rejection({ unit: 'writing', 'unit-version': '1' });
    const prior: ProseRecord = { units: {}, rejections: [older] };

    const record = composeRecord(prior, fold({ units: { writing: { version: '2', roots: ['.'] } } }));

    expect(record.rejections).toStrictEqual([older]);
  });
});

describe(isStaleRejection, () => {
  it('reports a rejection recorded at an older version as stale', () => {
    expect(isStaleRejection(rejection({ 'unit-version': '1' }), new Map([['writing', '2']]))).toBe(true);
  });

  it('reports a rejection recorded at the current version as current', () => {
    expect(isStaleRejection(rejection({ 'unit-version': '2' }), new Map([['writing', '2']]))).toBe(false);
  });

  it('reports a rejection whose unit the run does not name as current, the run holding no version to compare', () => {
    expect(isStaleRejection(rejection({ 'unit-version': '1' }), new Map())).toBe(false);
  });
});

describe(selectPriorRejections, () => {
  const versions = new Map([['writing', '2']]);

  it('selects a live rejection over a file the sweep read', () => {
    const record: ProseRecord = { units: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([
      { rule: 'reduced-object-relative', file: 'docs/guide.md', phrase: 'the source that it names' },
    ]);
  });

  it('selects a rejection under a rule the helper holds no detector for', () => {
    const record: ProseRecord = {
      units: {},
      rejections: [rejection({ rule: 'plain-speech', unit: 'plain-speech', 'unit-version': '3' })],
    };

    expect(selectPriorRejections(record, new Map([['plain-speech', '3']]), ['docs/guide.md'])).toHaveLength(1);
  });

  it('withholds a rejection recorded at an older unit version, so its site is judged afresh', () => {
    const record: ProseRecord = { units: {}, rejections: [rejection({ 'unit-version': '1' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection whose unit the run does not name, no version standing to re-open it', () => {
    const record: ProseRecord = { units: {}, rejections: [rejection({ unit: 'unbound' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection over a file the sweep did not read', () => {
    const record: ProseRecord = { units: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/other.md'])).toStrictEqual([]);
  });

  it("carries the site alone, the unit, version, and ground being the record's own bookkeeping", () => {
    const record: ProseRecord = { units: {}, rejections: [rejection()] };
    const [selected] = selectPriorRejections(record, versions, ['docs/guide.md']);

    expect(Object.keys(selected ?? {}).toSorted()).toStrictEqual(['file', 'phrase', 'rule']);
  });
});

describe(stringifyRecord, () => {
  it('round-trips without drift', () => {
    const record = composeRecord(
      EMPTY,
      fold({
        units: { writing: { version: '2', roots: ['.'] } },
        rejections: [foldRejection()],
      }),
    );

    expect(parseRecord(stringifyRecord(record))).toStrictEqual(record);
  });

  it('round-trips a rejection under a rule with no detector', () => {
    const record = composeRecord(
      EMPTY,
      fold({
        units: { 'plain-speech': { version: '3', roots: ['.'] } },
        rejections: [foldRejection({ rule: 'plain-speech', unit: 'plain-speech' })],
      }),
    );

    expect(record.rejections[0]).toMatchObject({ rule: 'plain-speech', 'unit-version': '3' });
    expect(parseRecord(stringifyRecord(record))).toStrictEqual(record);
  });

  it('renders the same bytes whatever order the units and rejections arrive in', () => {
    const first = rejection({ file: 'docs/a.md' });
    const second = rejection({ file: 'docs/b.md' });
    const coverage = { version: '2', 'swept-at': '2026-09-02', roots: ['.'] };

    const forward = stringifyRecord({ units: { a: coverage, b: coverage }, rejections: [first, second] });
    const reversed = stringifyRecord({ units: { b: coverage, a: coverage }, rejections: [second, first] });

    expect(forward).toBe(reversed);
  });

  it('writes each phrase on one line, so a long phrase is not folded into a diff of its own', () => {
    const phrase = `a phrase ${'long '.repeat(40)}enough to fold`;
    const yaml = stringifyRecord({ units: {}, rejections: [rejection({ phrase })] });

    expect(yaml.split('\n').some((line) => line.includes(phrase))).toBe(true);
  });
});

// region | Helpers

/** Builds an object-relative candidate, overriding whichever fields an assertion turns on. */
function candidate(overrides: Partial<ObjectRelativeCandidate> = {}): Candidate {
  return {
    rule: 'reduced-object-relative',
    file: 'docs/guide.md',
    line: 3,
    phrase: 'the source that it names',
    sentence: 'The helper reports the source that it names.',
    shape: 'pronoun',
    head: 'source',
    subject: 'it',
    verb: 'names',
    ...overrides,
  };
}

/** Builds a run fold, defaulting the date every assertion above reads. */
function fold(overrides: Partial<RunFold>): RunFold {
  return { sweptAt: '2026-09-02', units: {}, rejections: [], ...overrides };
}

/** Builds a fold rejection, which carries no version; the helper derives it from the unit covered by the fold. */
function foldRejection(overrides: Partial<FoldRejection> = {}): FoldRejection {
  return {
    rule: 'reduced-object-relative',
    unit: 'writing',
    file: 'docs/guide.md',
    phrase: 'the source that it names',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

/** Builds a recorded rejection, overriding whichever fields an assertion turns on. */
function rejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return {
    rule: 'reduced-object-relative',
    unit: 'writing',
    'unit-version': '2',
    file: 'docs/guide.md',
    phrase: 'the source that it names',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

/** Renders one rejection as record YAML, with the named fields overridden, for the parse-failure assertions. */
function rejectionYaml(overrides: Record<string, string>): string {
  const fields = {
    rule: 'reduced-object-relative',
    unit: 'writing',
    'unit-version': '2',
    file: 'docs/guide.md',
    phrase: 'the source that it names',
    ground: 'a quoted exhibit',
    ...overrides,
  };
  const entries = Object.entries(fields)
    .map(([key, value], index) => `${index === 0 ? '  - ' : ' '.repeat(4)}${key}: "${value}"`)
    .join('\n');
  return `rejections:\n${entries}\n`;
}

// endregion | Helpers

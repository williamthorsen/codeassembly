import { describe, expect, it } from 'vitest';

import { composeRecord, hashPhrase, isStaleRejection, parseRecord, RECORD_PATH, stringifyRecord } from '../record.ts';
import type { ProseRecord, RecordedRejection, RunFold } from '../types.ts';

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

  it('refuses a rejection naming a rule the helper does not detect', () => {
    expect(() => parseRecord(rejectionYaml({ rule: 'sentence-case' }))).toThrow(/Invalid sweep record/);
  });

  it('refuses a hash that is not sixteen hex characters', () => {
    expect(() => parseRecord(rejectionYaml({ hash: 'nope' }))).toThrow(/16 lowercase hex/);
  });

  it('names the record in its failure, so a malformed file is findable', () => {
    expect(() => parseRecord('units: [not, a, map]')).toThrow(new RegExp(RECORD_PATH.replace('.', String.raw`\.`)));
  });
});

describe(hashPhrase, () => {
  it('returns sixteen lowercase hex characters', () => {
    expect(hashPhrase('the source that it names')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ignores a reflow, so a repair that only rewraps a line keeps the rejection', () => {
    expect(hashPhrase('the source\n  that it names')).toBe(hashPhrase('the source that it names'));
  });

  it('ignores a Unicode normalization difference', () => {
    expect(hashPhrase('café menu')).toBe(hashPhrase('café menu'));
  });

  it('distinguishes phrases that differ in a word', () => {
    expect(hashPhrase('the source that it names')).not.toBe(hashPhrase('the source that it holds'));
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
    const kept = rejection({ unit: 'writing', 'unit-version': '2', file: 'docs/a.md', hash: '1111111111111111' });
    const withdrawn = rejection({ unit: 'writing', 'unit-version': '2', file: 'docs/b.md', hash: '2222222222222222' });
    const prior: ProseRecord = { units: {}, rejections: [kept, withdrawn] };

    const record = composeRecord(
      prior,
      fold({ units: { writing: { version: '2', roots: ['.'] } }, rejections: [kept] }),
    );

    expect(record.rejections).toStrictEqual([kept]);
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

describe(stringifyRecord, () => {
  it('round-trips without drift', () => {
    const record = composeRecord(
      EMPTY,
      fold({
        units: { writing: { version: '2', roots: ['.'] } },
        rejections: [rejection({ unit: 'writing', 'unit-version': '2' })],
      }),
    );

    expect(parseRecord(stringifyRecord(record))).toStrictEqual(record);
  });

  it('renders the same bytes whatever order the units and rejections arrive in', () => {
    const first = rejection({ file: 'docs/a.md', hash: 'aaaaaaaaaaaaaaaa' });
    const second = rejection({ file: 'docs/b.md', hash: 'bbbbbbbbbbbbbbbb' });
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

/** Builds a run fold, defaulting the date every assertion above reads. */
function fold(overrides: Partial<RunFold>): RunFold {
  return { sweptAt: '2026-09-02', units: {}, rejections: [], ...overrides };
}

/** Builds a rejection, overriding whichever fields an assertion turns on. */
function rejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return {
    rule: 'reduced-object-relative',
    unit: 'writing',
    'unit-version': '2',
    file: 'docs/guide.md',
    phrase: 'the source that it names',
    hash: '0123456789abcdef',
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
    hash: '0123456789abcdef',
    ground: 'a quoted exhibit',
    ...overrides,
  };
  const entries = Object.entries(fields)
    .map(([key, value], index) => `${index === 0 ? '  - ' : ' '.repeat(4)}${key}: "${value}"`)
    .join('\n');
  return `rejections:\n${entries}\n`;
}

// endregion | Helpers

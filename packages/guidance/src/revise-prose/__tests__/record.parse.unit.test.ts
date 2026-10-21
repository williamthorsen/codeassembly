import { describe, expect, it } from 'vitest';

import { parseRecord, parseRunFold, RECORD_PATH } from '../parse-record.ts';
import { composeRecord, stringifyRecord } from '../record.ts';
import {
  coverage,
  EMPTY,
  fold,
  foldRejection,
  hasEmDashDetector,
  hasEverySite,
  NO_HASHES,
  rejection,
} from '../test-utils/record-fixtures.ts';
import type { ProseRecord, RecordedRejection, SweepVersions } from '../types.ts';

const NO_VERSIONS: SweepVersions = { units: new Map(), rules: new Map() };

describe(parseRecord, () => {
  it('reads an absent record as the empty one', () => {
    expect(parseRecord('', NO_VERSIONS)).toStrictEqual(EMPTY);
  });

  it('reads a record naming rules alone', () => {
    const record = parseRecord(
      'rules:\n  em-dash:\n    version: "2"\n    swept-at: 2026-09-02\n    detected: true\n    roots:\n      - "."\n',
      NO_VERSIONS,
    );

    expect(record.rules['em-dash']).toStrictEqual({
      version: '2',
      'swept-at': '2026-09-02',
      detected: true,
      roots: ['.'],
    });
    expect(record.rejections).toStrictEqual([]);
  });

  it('refuses a record whose date is not an ISO calendar date', () => {
    expect(() =>
      parseRecord(
        'rules:\n  em-dash:\n    version: "2"\n    swept-at: yesterday\n    detected: true\n    roots: ["."]\n',
        NO_VERSIONS,
      ),
    ).toThrow(/ISO calendar date/);
  });

  it('reads a rejection under a rule for which the helper does not have a detector', () => {
    const record = parseRecord(rejectionYaml({ rule: 'plain-speech' }), NO_VERSIONS);

    expect(record.rejections[0]?.rule).toBe('plain-speech');
  });

  it('refuses a rejection whose rule is not a kebab-case name', () => {
    expect(() => parseRecord(rejectionYaml({ rule: 'Plain Speech' }), NO_VERSIONS)).toThrow(/kebab-case/);
  });

  it('names the record in its failure, so a malformed file is findable', () => {
    expect(() => parseRecord('rules: [not, a, map]', NO_VERSIONS)).toThrow(
      new RegExp(RECORD_PATH.replace('.', String.raw`\.`)),
    );
  });

  it('converts a record keyed on unit versions against the versions that the run declares', () => {
    const versions: SweepVersions = {
      units: new Map([['writing', '8']]),
      rules: new Map([['em-dash', { unit: 'writing', version: '1' }]]),
    };
    const legacy =
      'units:\n  writing:\n    version: "8"\n    swept-at: 2026-09-02\n    rules: [em-dash]\n    roots: ["."]\n';

    expect(parseRecord(legacy, versions).rules['em-dash']).toStrictEqual({
      version: '1',
      'swept-at': '2026-09-02',
      detected: true,
      roots: ['.'],
    });
  });

  it('refuses a malformed record keyed on unit versions', () => {
    expect(() => parseRecord('units: [not, a, map]', NO_VERSIONS)).toThrow(/Invalid sweep record/);
  });

  it('reads a record keyed on unit versions still containing a hash, which neither schema defines', () => {
    const legacy =
      'units: {}\nrejections:\n  - rule: em-dash\n    unit: writing\n    unit-version: "2"\n    file: docs/guide.md\n' +
      '    phrase: the source\n    ground: an exhibit\n    hash: "0123456789abcdef"\n';

    expect(parseRecord(legacy, NO_VERSIONS).rejections[0]).not.toHaveProperty('hash');
  });

  it('refuses a record containing both units and rules, neither shape accounting for the other', () => {
    expect(() => parseRecord('units: {}\nrules: {}\n', NO_VERSIONS)).toThrow(/both units and rules/);
  });
});

describe(parseRunFold, () => {
  it('reads a fold naming its roots, units, and versioned rules', () => {
    const json = JSON.stringify(fold({}));

    expect(parseRunFold(json)).toStrictEqual(fold({}));
  });

  it('refuses a fold whose rule names a unit that its units do not declare', () => {
    const json = JSON.stringify(fold({ units: {} }));

    expect(() => parseRunFold(json)).toThrow(/rules\.em-dash\.unit/);
  });

  it('refuses a fold whose rule version is not a positive integer', () => {
    const json = JSON.stringify(fold({ rules: { 'em-dash': { unit: 'writing', version: '0' } } }));

    expect(() => parseRunFold(json)).toThrow(/positive integer/);
  });

  it('refuses a fold that does not name any roots', () => {
    const rootless = Object.fromEntries(Object.entries(fold({})).filter(([key]) => key !== 'roots'));

    expect(() => parseRunFold(JSON.stringify(rootless))).toThrow(/roots/);
  });
});

describe(stringifyRecord, () => {
  it('writes each file on one line and round-trips hashes that read as numbers', () => {
    const record: ProseRecord = {
      rules: { 'em-dash': coverage() },
      files: {
        'docs/a.md': { hash: '1234567890123456', rules: ['em-dash', 'so'] },
        'docs/b.md': { hash: '123456789012e456', rules: ['em-dash'] },
      },
      rejections: [],
    };

    const yaml = stringifyRecord(record);

    expect(yaml).toContain('  docs/a.md: { hash: "1234567890123456", rules: [ em-dash, so ] }\n');
    expect(parseRecord(yaml, NO_VERSIONS)).toStrictEqual(record);
    expect(stringifyRecord(parseRecord(yaml, NO_VERSIONS))).toBe(yaml);
  });

  it('omits the file table from a record that has none, which parses back without one', () => {
    const yaml = stringifyRecord({ rules: { 'em-dash': coverage() }, rejections: [] });

    expect(yaml).not.toContain('files');
    expect(parseRecord(yaml, NO_VERSIONS)).not.toHaveProperty('files');
  });

  it('round-trips without drift', () => {
    const record = composeRecord(
      EMPTY,
      fold({ rejections: [foldRejection()] }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(parseRecord(stringifyRecord(record), NO_VERSIONS)).toStrictEqual(record);
  });

  it('round-trips a rejection under a rule without a detector', () => {
    const record = composeRecord(
      EMPTY,
      fold({
        units: { 'plain-speech': '6' },
        rules: { 'plain-speech': { unit: 'plain-speech', version: '6' } },
        rejections: [foldRejection({ rule: 'plain-speech' })],
      }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(record.rejections[0]).toMatchObject({ rule: 'plain-speech', 'rule-version': '6' });
    expect(parseRecord(stringifyRecord(record), NO_VERSIONS)).toStrictEqual(record);
  });

  it('renders the same bytes whatever order the input gives the rules, rejections, and their fields in', () => {
    const first = rejection({ file: 'docs/a.md' });
    const second = rejection({ file: 'docs/b.md' });
    const reordered: RecordedRejection = {
      ground: second.ground,
      phrase: second.phrase,
      file: second.file,
      'rule-version': second['rule-version'],
      rule: second.rule,
    };

    const forward = stringifyRecord({ rules: { a: coverage(), b: coverage() }, rejections: [first, second] });
    const reversed = stringifyRecord({ rules: { b: coverage(), a: coverage() }, rejections: [reordered, first] });

    expect(forward).toBe(reversed);
  });

  it('writes each phrase on one line, so a long phrase is not folded into a diff of its own', () => {
    const phrase = `a phrase ${'long '.repeat(40)}enough to fold`;
    const yaml = stringifyRecord({ rules: {}, rejections: [rejection({ phrase })] });

    expect(yaml.split('\n').some((line) => line.includes(phrase))).toBe(true);
  });

  it('writes roots shared between rules in full, so a rewrite of the parsed record renders the same bytes', () => {
    const roots = ['docs', 'packages'];
    const yaml = stringifyRecord({ rules: { a: coverage({ roots }), b: coverage({ roots }) }, rejections: [] });

    expect(yaml).not.toMatch(/[&*]a\d/);
    expect(stringifyRecord(parseRecord(yaml, NO_VERSIONS))).toBe(yaml);
  });
});

// region | Helpers

/** Renders one rejection as record YAML, with the named fields overridden, for the parse-failure assertions. */
function rejectionYaml(overrides: Record<string, string>): string {
  const fields = {
    rule: 'em-dash',
    'rule-version': '1',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a quoted exhibit',
    ...overrides,
  };
  const entries = Object.entries(fields)
    .map(([key, value], index) => `${index === 0 ? '  - ' : ' '.repeat(4)}${key}: "${value}"`)
    .join('\n');
  return `rejections:\n${entries}\n`;
}

// endregion | Helpers

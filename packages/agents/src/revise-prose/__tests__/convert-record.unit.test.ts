import { describe, expect, it } from 'vitest';

import { convertLegacyRecord, LEGACY_STALE_VERSION } from '../convert-record.ts';
import type { LegacyRecord, LegacyRejection, LegacyUnitCoverage, SweepVersions } from '../types.ts';

/** The versions that a run declares: `writing` at 8 with two versioned rules, and `plain-speech` at 6. */
const VERSIONS: SweepVersions = {
  units: new Map([
    ['plain-speech', '6'],
    ['writing', '8'],
  ]),
  rules: new Map([
    ['em-dash', { unit: 'writing', version: '1' }],
    ['plain-speech', { unit: 'plain-speech', version: '6' }],
    ['sentence-case', { unit: 'writing', version: '2' }],
  ]),
};

describe(convertLegacyRecord, () => {
  it("copies a unit's coverage at its current version to each of its versioned rules, at the rule's version", () => {
    const converted = convertLegacyRecord(legacyRecord({ units: { writing: unitCoverage() } }), VERSIONS);

    expect(converted.rules).toStrictEqual({
      'em-dash': { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['docs'] },
      'sentence-case': { version: '2', 'swept-at': '2026-09-02', detected: false, roots: ['docs'] },
    });
  });

  it("records a rule as detected only when the unit's sweeps ran its detector", () => {
    const converted = convertLegacyRecord(legacyRecord({ units: { writing: unitCoverage({ rules: [] }) } }), VERSIONS);

    expect(converted.rules['em-dash']?.detected).toBe(false);
  });

  it('converts a unit recorded at an older version to no coverage', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ units: { writing: unitCoverage({ version: '7' }) } }),
      VERSIONS,
    );

    expect(converted.rules).toStrictEqual({});
  });

  it('converts a unit that the run does not name to no coverage', () => {
    const converted = convertLegacyRecord(legacyRecord({ units: { unbound: unitCoverage() } }), VERSIONS);

    expect(converted.rules).toStrictEqual({});
  });

  it('records nothing for a rule of a current unit that declares no sweep version', () => {
    const versions: SweepVersions = { units: VERSIONS.units, rules: new Map() };

    const converted = convertLegacyRecord(legacyRecord({ units: { writing: unitCoverage() } }), versions);

    expect(converted.rules).toStrictEqual({});
  });

  it('converts plain-speech as the one rule of its own unit', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ units: { 'plain-speech': unitCoverage({ version: '6', rules: [] }) } }),
      VERSIONS,
    );

    expect(converted.rules['plain-speech']).toMatchObject({ version: '6', detected: false });
  });

  it("gives a rejection under a current unit its rule's sweep version, and keeps its site", () => {
    const converted = convertLegacyRecord(legacyRecord({ rejections: [legacyRejection()] }), VERSIONS);

    expect(converted.rejections).toStrictEqual([
      { rule: 'em-dash', 'rule-version': '1', file: 'docs/guide.md', phrase: 'The cache is cold', ground: 'a label' },
    ]);
  });

  it('marks a rejection recorded at an older unit version stale', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ rejections: [legacyRejection({ 'unit-version': '7' })] }),
      VERSIONS,
    );

    expect(converted.rejections[0]?.['rule-version']).toBe(LEGACY_STALE_VERSION);
  });

  it('marks a rejection under a unit that the run does not name stale, rather than dropping it', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ rejections: [legacyRejection({ unit: 'unbound', rule: 'unbound-rule' })] }),
      VERSIONS,
    );

    expect(converted.rejections).toMatchObject([{ rule: 'unbound-rule', 'rule-version': LEGACY_STALE_VERSION }]);
  });

  it('drops a rejection under a rule of a named unit that declares no sweep version', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ rejections: [legacyRejection({ rule: 'capitalization-after-colon' })] }),
      VERSIONS,
    );

    expect(converted.rejections).toStrictEqual([]);
  });

  it('marks a rejection stale when its rule now belongs to another unit', () => {
    const converted = convertLegacyRecord(
      legacyRecord({ rejections: [legacyRejection({ rule: 'plain-speech' })] }),
      VERSIONS,
    );

    expect(converted.rejections[0]?.['rule-version']).toBe(LEGACY_STALE_VERSION);
  });
});

// region | Helpers

/** Builds a legacy record, empty unless overridden. */
function legacyRecord(overrides: Partial<LegacyRecord>): LegacyRecord {
  return { units: {}, rejections: [], ...overrides };
}

/** Builds a legacy rejection under `em-dash` in `writing` at version 8, overriding named fields. */
function legacyRejection(overrides: Partial<LegacyRejection> = {}): LegacyRejection {
  return {
    rule: 'em-dash',
    unit: 'writing',
    'unit-version': '8',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a label',
    ...overrides,
  };
}

/** Builds a legacy unit's coverage of `docs` at version 8 with the `em-dash` detector run, overriding named fields. */
function unitCoverage(overrides: Partial<LegacyUnitCoverage> = {}): LegacyUnitCoverage {
  return { version: '8', 'swept-at': '2026-09-02', rules: ['em-dash'], roots: ['docs'], ...overrides };
}

// endregion | Helpers

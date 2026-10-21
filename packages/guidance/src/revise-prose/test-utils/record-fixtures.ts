import type { FoldRejection, ProseRecord, RecordedRejection, RuleCoverage, RunFold } from '../types.ts';

export const EMPTY: ProseRecord = { rules: {}, rejections: [] };

/** The hashes of a run whose scan yielded no file, for the assertions that do not turn on file coverage. */
export const NO_HASHES: ReadonlyMap<string, string> = new Map();

/** The prose hash at which {@link coveredRecord} records its files. */
export const HASH = 'a1b2c3d4e5f60718';

/** Builds one rule's coverage of the whole repository at version 1 with its detector run, overriding named fields. */
export function coverage(overrides: Partial<RuleCoverage> = {}): RuleCoverage {
  return { version: '1', 'swept-at': '2026-09-01', detected: true, roots: ['.'], ...overrides };
}

/** Builds a run fold over the whole repository versioning `em-dash`, overriding whichever fields an assertion turns on. */
export function fold(overrides: Partial<RunFold>): RunFold {
  return {
    sweptAt: '2026-09-02',
    roots: ['.'],
    units: { writing: '8' },
    rules: { 'em-dash': { unit: 'writing', version: '1' } },
    rejections: [],
    ...overrides,
  };
}

/**
 * Builds a fold rejection, which does not declare a version; the helper derives it from the fold's entry for its rule.
 */
export function foldRejection(overrides: Partial<FoldRejection> = {}): FoldRejection {
  return {
    rule: 'em-dash',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

/** Reports that the helper has a detector for `em-dash` alone. */
export function hasEmDashDetector(rule: string): boolean {
  return rule === 'em-dash';
}

/** Reports every rejection's site as present. */
export function hasEverySite(): boolean {
  return true;
}

/** Builds a recorded rejection, overriding whichever fields an assertion turns on. */
export function rejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return {
    rule: 'em-dash',
    'rule-version': '1',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

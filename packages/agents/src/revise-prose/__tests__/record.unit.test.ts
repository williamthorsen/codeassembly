import { describe, expect, it } from 'vitest';

import {
  applyRejections,
  composeRecord,
  containsPhrase,
  isStaleRejection,
  listUnsweptRules,
  parseRecord,
  parseRunFold,
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
  RuleCoverage,
  RunFold,
  SweepVersions,
} from '../types.ts';

const EMPTY: ProseRecord = { rules: {}, rejections: [] };

const NO_VERSIONS: SweepVersions = { units: new Map(), rules: new Map() };

/** Rules in unit `writing`, one with a detector and one without. */
const WRITING_RULES: RunFold['rules'] = {
  'em-dash': { unit: 'writing', version: '1' },
  'sentence-case': { unit: 'writing', version: '1' },
};

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

  it('reads a rejection under a rule the helper holds no detector for', () => {
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

  it('converts a record keyed on unit versions against the versions that the run holds', () => {
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

  it('reads a record keyed on unit versions still holding a hash, which neither schema defines', () => {
    const legacy =
      'units: {}\nrejections:\n  - rule: em-dash\n    unit: writing\n    unit-version: "2"\n    file: docs/guide.md\n' +
      '    phrase: the source\n    ground: an exhibit\n    hash: "0123456789abcdef"\n';

    expect(parseRecord(legacy, NO_VERSIONS).rejections[0]).not.toHaveProperty('hash');
  });

  it('refuses a record holding both units and rules, neither shape accounting for the other', () => {
    expect(() => parseRecord('units: {}\nrules: {}\n', NO_VERSIONS)).toThrow(/both units and rules/);
  });
});

describe(applyRejections, () => {
  const versions = new Map([['reduced-object-relative', '1']]);

  it('suppresses a site whose recorded phrase runs wider than the span reported by the detector', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'rule it names' })],
      { rules: {}, rejections: [relativeRejection({ phrase: 'whatever rule it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site whose recorded phrase sits inside the span reported by the detector', () => {
    const sentence = 'The cache is cold, so the transport reconnects.';
    const applied = applyRejections(
      [{ rule: 'em-dash', file: 'docs/guide.md', line: 3, phrase: sentence, sentence }],
      { rules: {}, rejections: [rejection({ phrase: 'so the transport reconnects' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across an inline code span, which the detector elides and the record holds whole', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'enumerate their «codespan» reasons' })],
      { rules: {}, rejections: [relativeRejection({ phrase: 'enumerate their `unavailable` reasons' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across a reflow, so a repair that only rewraps a line keeps the rejection', () => {
    const applied = applyRejections(
      [candidate()],
      { rules: {}, rejections: [relativeRejection({ phrase: 'the source\n  that it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across a Unicode normalization difference', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'the caf\u{E9} that it names' })],
      { rules: {}, rejections: [relativeRejection({ phrase: 'the cafe\u{301} that it names' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('leaves a site under a rule that the rejection does not name, one verdict settling one rule', () => {
    const applied = applyRejections(
      [candidate()],
      { rules: {}, rejections: [relativeRejection({ rule: 'em-dash' })] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('leaves a site in a file that the rejection does not name', () => {
    const applied = applyRejections(
      [candidate()],
      { rules: {}, rejections: [relativeRejection({ file: 'docs/other.md' })] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('leaves a site whose span the recorded phrase does not reach', () => {
    const applied = applyRejections(
      [candidate({ phrase: 'the level against which it is probed' })],
      { rules: {}, rejections: [relativeRejection()] },
      versions,
    );

    expect(applied).toHaveLength(1);
  });

  it('marks a site recorded at an older version of its rule stale, which re-opens it for review', () => {
    const applied = applyRejections(
      [candidate()],
      { rules: {}, rejections: [relativeRejection({ 'rule-version': '0' })] },
      versions,
    );

    expect(applied).toStrictEqual([{ ...candidate(), stale: true }]);
  });

  it('suppresses a site that a live rejection covers, whatever a stale one recorded beside it holds', () => {
    const applied = applyRejections(
      [candidate()],
      {
        rules: {},
        rejections: [
          relativeRejection({ 'rule-version': '0', phrase: 'the source that it names, as an earlier sweep left it' }),
          relativeRejection(),
        ],
      },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });
});

describe(composeRecord, () => {
  it('records each rule the run versioned, with whether the helper holds its detector', () => {
    const record = composeRecord(EMPTY, fold({ rules: WRITING_RULES }), hasEverySite, hasEmDashDetector);

    expect(record.rules).toStrictEqual({
      'em-dash': { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['.'] },
      'sentence-case': { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] },
    });
  });

  it('sorts the roots it records, so a rewrite does not depend on the order of the run', () => {
    const record = composeRecord(EMPTY, fold({ roots: ['src', 'docs'] }), hasEverySite, hasEmDashDetector);

    expect(record.rules['em-dash']?.roots).toStrictEqual(['docs', 'src']);
  });

  it("joins a narrowed run's roots onto those already recorded at the same version", () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ roots: ['docs'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['src'] }), hasEverySite, hasEmDashDetector);

    expect(record.rules['em-dash']).toStrictEqual(coverage({ 'swept-at': '2026-09-02', roots: ['docs', 'src'] }));
  });

  it('drops a joined root that another one already contains', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ roots: ['.'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasEverySite, hasEmDashDetector);

    expect(record.rules['em-dash']?.roots).toStrictEqual(['.']);
  });

  it('replaces the recorded roots when the sweep version rises, the earlier sweep covering a rule that has changed', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ version: '1', roots: ['.'] }) }, rejections: [] };

    const record = composeRecord(
      prior,
      fold({ roots: ['docs'], rules: { 'em-dash': { unit: 'writing', version: '2' } } }),
      hasEverySite,
      hasEmDashDetector,
    );

    expect(record.rules['em-dash']).toMatchObject({ version: '2', roots: ['docs'] });
  });

  it('replaces the recorded roots when the detector state differs, the earlier sweep having seen other candidates', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ detected: false, roots: ['docs'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['src'] }), hasEverySite, hasEmDashDetector);

    expect(record.rules['em-dash']).toMatchObject({ detected: true, roots: ['src'] });
  });

  it('leaves the coverage and rejections of a rule the run did not version untouched', () => {
    const prior: ProseRecord = {
      rules: { 'plain-speech': coverage({ version: '5', detected: false, 'swept-at': '2026-01-01' }) },
      rejections: [rejection({ rule: 'plain-speech', 'rule-version': '5' })],
    };

    const record = composeRecord(prior, fold({}), hasNoSite, hasEmDashDetector);

    expect(record.rules['plain-speech']).toStrictEqual(prior.rules['plain-speech']);
    expect(record.rejections).toContainEqual(prior.rejections[0]);
  });

  it("keeps a swept rule's rejection at the current version while its site exists, though the run did not report it", () => {
    const standing = rejection({ file: 'docs/a.md' });
    const repaired = rejection({ file: 'docs/b.md', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { rules: {}, rejections: [standing, repaired] };

    const record = composeRecord(
      prior,
      fold({ roots: ['docs'] }),
      (site) => site.file === 'docs/a.md',
      hasEmDashDetector,
    );

    expect(record.rejections).toStrictEqual([standing]);
  });

  it('keeps every rejection whose site exists when the run swept the whole repository and reported none', () => {
    const inDocs = rejection({ file: 'docs/a.md' });
    const inSource = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { rules: {}, rejections: [inDocs, inSource] };

    const record = composeRecord(prior, fold({}), hasEverySite, hasEmDashDetector);

    expect(record.rejections).toStrictEqual([inDocs, inSource]);
  });

  it('consults the site of a current-version rejection under the swept roots alone', () => {
    const consulted: RecordedRejection[] = [];
    const current = rejection({ file: 'docs/a.md' });
    const prior: ProseRecord = {
      rules: {},
      rejections: [
        current,
        rejection({ file: 'docs/b.md', 'rule-version': '0' }),
        rejection({ file: 'src/c.ts' }),
        rejection({ rule: 'plain-speech', file: 'docs/d.md' }),
      ],
    };

    composeRecord(
      prior,
      fold({ roots: ['docs'] }),
      (site) => {
        consulted.push(site);
        return true;
      },
      hasEmDashDetector,
    );

    expect(consulted).toStrictEqual([current]);
  });

  it('records the phrase reported by the fold, at the sweep version of the rule that it names', () => {
    const record = composeRecord(
      EMPTY,
      fold({ rejections: [foldRejection({ phrase: 'The cache is cold, as a heading might read' })] }),
      hasEverySite,
      hasEmDashDetector,
    );

    expect(record.rejections[0]).toMatchObject({
      phrase: 'The cache is cold, as a heading might read',
      'rule-version': '1',
    });
  });

  it('refuses a fold whose rejection names a rule it does not version', () => {
    expect(() =>
      composeRecord(
        EMPTY,
        fold({ rejections: [foldRejection({ rule: 'plain-speech' })] }),
        hasEverySite,
        hasEmDashDetector,
      ),
    ).toThrow(/which the fold does not version/);
  });

  it('retires the entry it supersedes across a reflow, a rewrapped line naming the same site', () => {
    const standing = rejection({ phrase: 'The cache\n  is cold', ground: 'an earlier ground' });
    const prior: ProseRecord = { rules: {}, rejections: [standing] };

    const record = composeRecord(prior, fold({ rejections: [foldRejection()] }), hasEverySite, hasEmDashDetector);

    expect(record.rejections).toStrictEqual([rejection()]);
  });

  it('holds one entry per site when a raised version is followed by a re-rejection of the same site', () => {
    const older = rejection({ 'rule-version': '0' });
    const prior: ProseRecord = { rules: {}, rejections: [older] };

    const record = composeRecord(prior, fold({ rejections: [foldRejection()] }), hasEverySite, hasEmDashDetector);

    expect(record.rejections).toHaveLength(1);
    expect(record.rejections[0]).toMatchObject({ 'rule-version': '1' });
  });

  it('carries forward a rejection outside the roots swept by the run, whatever its site, the run never having revisited it', () => {
    const inside = rejection({ file: 'docs/a.md' });
    const outside = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { rules: {}, rejections: [inside, outside] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasNoSite, hasEmDashDetector);

    expect(record.rejections).toStrictEqual([outside]);
  });

  it('retires a rejection recorded at an older version under the swept roots, the run having reviewed it', () => {
    const prior: ProseRecord = { rules: {}, rejections: [rejection({ 'rule-version': '0' })] };

    const record = composeRecord(prior, fold({}), hasEverySite, hasEmDashDetector);

    expect(record.rejections).toStrictEqual([]);
  });

  it('keeps a rejection recorded at an older version outside the swept roots, which the run did not review', () => {
    const older = rejection({ file: 'src/b.ts', 'rule-version': '0' });
    const prior: ProseRecord = { rules: {}, rejections: [older] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasEverySite, hasEmDashDetector);

    expect(record.rejections).toStrictEqual([older]);
  });
});

describe(containsPhrase, () => {
  it('finds a phrase reported verbatim across comment markers, which extraction strips', () => {
    const text = { prose: 'Resolves the source it names.', content: '/**\n * Resolves the source\n * it names.\n */' };

    expect(containsPhrase(text, 'the source\n * it names')).toBe(true);
  });

  it('finds no phrase that neither the prose nor the content holds', () => {
    const text = { prose: 'Resolves the source that it names.', content: '// Resolves the source that it names.' };

    expect(containsPhrase(text, 'the source it names')).toBe(false);
  });
});

describe(listUnsweptRules, () => {
  const versions = new Map([
    ['em-dash', '1'],
    ['sentence-case', '1'],
  ]);

  it("lists no rule for a file under a recorded root at each rule's current version, with each held detector having run", () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage({ detected: false }) });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md')).toStrictEqual([]);
  });

  it('lists a rule whose recorded sweep did not run the detector that the helper now holds', () => {
    const record = coveredRecord({ 'em-dash': coverage({ detected: false }), 'sentence-case': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md')).toStrictEqual(['em-dash']);
  });

  it('lists a rule recorded at another version alone, the other rule still covering the file', () => {
    const record = coveredRecord({ 'em-dash': coverage(), 'sentence-case': coverage({ version: '2' }) });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md')).toStrictEqual(['sentence-case']);
  });

  it('lists a rule that the record does not name', () => {
    const record = coveredRecord({ 'em-dash': coverage() });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'docs/guide.md')).toStrictEqual(['sentence-case']);
  });

  it('lists every rule for a file outside every recorded root', () => {
    const record = coveredRecord({
      'em-dash': coverage({ roots: ['docs'] }),
      'sentence-case': coverage({ detected: false, roots: ['docs'] }),
    });

    expect(listUnsweptRules(record, versions, hasEmDashDetector, 'src/notes.md')).toStrictEqual([
      'em-dash',
      'sentence-case',
    ]);
  });

  it('lists no rule for a run that versions no rule', () => {
    const record = coveredRecord({ 'em-dash': coverage() });

    expect(listUnsweptRules(record, new Map(), hasEmDashDetector, 'docs/guide.md')).toStrictEqual([]);
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

  it('refuses a fold that names no roots', () => {
    const rootless = Object.fromEntries(Object.entries(fold({})).filter(([key]) => key !== 'roots'));

    expect(() => parseRunFold(JSON.stringify(rootless))).toThrow(/roots/);
  });
});

describe(isStaleRejection, () => {
  it('reports a rejection recorded at an older version of its rule as stale', () => {
    expect(isStaleRejection(rejection({ 'rule-version': '0' }), new Map([['em-dash', '1']]))).toBe(true);
  });

  it('reports a rejection recorded at the current version of its rule as current', () => {
    expect(isStaleRejection(rejection(), new Map([['em-dash', '1']]))).toBe(false);
  });

  it('reports a rejection whose rule the run does not version as current, the run holding no version to compare', () => {
    expect(isStaleRejection(rejection({ 'rule-version': '0' }), new Map())).toBe(false);
  });
});

describe(selectPriorRejections, () => {
  const versions = new Map([['em-dash', '1']]);

  it('selects a live rejection over a file the sweep read', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([
      { rule: 'em-dash', file: 'docs/guide.md', phrase: 'The cache is cold' },
    ]);
  });

  it('selects a rejection under a rule the helper holds no detector for', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ rule: 'plain-speech', 'rule-version': '6' })] };

    expect(selectPriorRejections(record, new Map([['plain-speech', '6']]), ['docs/guide.md'])).toHaveLength(1);
  });

  it('withholds a rejection recorded at an older version of its rule, so its site is judged afresh', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ 'rule-version': '0' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection whose rule the run does not version, no version standing to re-open it', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection({ rule: 'sentence-case' })] };

    expect(selectPriorRejections(record, versions, ['docs/guide.md'])).toStrictEqual([]);
  });

  it('withholds a rejection over a file the sweep did not read', () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };

    expect(selectPriorRejections(record, versions, ['docs/other.md'])).toStrictEqual([]);
  });

  it("carries the site alone, the version and ground being the record's own bookkeeping", () => {
    const record: ProseRecord = { rules: {}, rejections: [rejection()] };
    const [selected] = selectPriorRejections(record, versions, ['docs/guide.md']);

    expect(Object.keys(selected ?? {}).toSorted()).toStrictEqual(['file', 'phrase', 'rule']);
  });
});

describe(stringifyRecord, () => {
  it('round-trips without drift', () => {
    const record = composeRecord(EMPTY, fold({ rejections: [foldRejection()] }), hasEverySite, hasEmDashDetector);

    expect(parseRecord(stringifyRecord(record), NO_VERSIONS)).toStrictEqual(record);
  });

  it('round-trips a rejection under a rule with no detector', () => {
    const record = composeRecord(
      EMPTY,
      fold({
        units: { 'plain-speech': '6' },
        rules: { 'plain-speech': { unit: 'plain-speech', version: '6' } },
        rejections: [foldRejection({ rule: 'plain-speech' })],
      }),
      hasEverySite,
      hasEmDashDetector,
    );

    expect(record.rejections[0]).toMatchObject({ rule: 'plain-speech', 'rule-version': '6' });
    expect(parseRecord(stringifyRecord(record), NO_VERSIONS)).toStrictEqual(record);
  });

  it('renders the same bytes whatever order the rules, rejections, and their fields arrive in', () => {
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

/** Builds one rule's coverage of the whole repository at version 1 with its detector run, overriding named fields. */
function coverage(overrides: Partial<RuleCoverage> = {}): RuleCoverage {
  return { version: '1', 'swept-at': '2026-09-01', detected: true, roots: ['.'], ...overrides };
}

/** Builds a record holding the given coverage and no rejection. */
function coveredRecord(rules: ProseRecord['rules']): ProseRecord {
  return { rules, rejections: [] };
}

/** Builds a run fold over the whole repository versioning `em-dash`, overriding whichever fields an assertion turns on. */
function fold(overrides: Partial<RunFold>): RunFold {
  return {
    sweptAt: '2026-09-02',
    roots: ['.'],
    units: { writing: '8' },
    rules: { 'em-dash': { unit: 'writing', version: '1' } },
    rejections: [],
    ...overrides,
  };
}

/** Builds a fold rejection, which carries no version; the helper derives it from the fold's entry for its rule. */
function foldRejection(overrides: Partial<FoldRejection> = {}): FoldRejection {
  return {
    rule: 'em-dash',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

/** Reports that the helper holds a detector for `em-dash` alone. */
function hasEmDashDetector(rule: string): boolean {
  return rule === 'em-dash';
}

/** Reports every rejection's site as present. */
function hasEverySite(): boolean {
  return true;
}

/** Reports every rejection's site as gone. */
function hasNoSite(): boolean {
  return false;
}

/** Builds a recorded rejection, overriding whichever fields an assertion turns on. */
function rejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return {
    rule: 'em-dash',
    'rule-version': '1',
    file: 'docs/guide.md',
    phrase: 'The cache is cold',
    ground: 'a quoted exhibit of the construction',
    ...overrides,
  };
}

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

/** Builds a rejection under `reduced-object-relative` naming the site of `candidate`, overriding named fields. */
function relativeRejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return rejection({ rule: 'reduced-object-relative', phrase: 'the source that it names', ...overrides });
}

// endregion | Helpers

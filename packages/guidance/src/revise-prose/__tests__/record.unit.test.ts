import { describe, expect, it } from 'vitest';

import { applyRejections, composeRecord, listUnsweptRules } from '../record.ts';
import {
  coverage,
  EMPTY,
  fold,
  foldRejection,
  hasEmDashDetector,
  hasEverySite,
  HASH,
  NO_HASHES,
  rejection,
} from '../test-utils/record-fixtures.ts';
import type { Candidate, ObjectRelativeCandidate, ProseRecord, RecordedRejection, RunFold } from '../types.ts';

/** Rules in unit `writing`, one with a detector and one without. */
const WRITING_RULES: RunFold['rules'] = {
  'em-dash': { unit: 'writing', version: '1' },
  'sentence-case': { unit: 'writing', version: '1' },
};

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

  it('suppresses a site whose recorded phrase is inside the span reported by the detector', () => {
    const sentence = 'The cache is cold, so the transport reconnects.';
    const applied = applyRejections(
      [{ rule: 'em-dash', file: 'docs/guide.md', line: 3, phrase: sentence, sentence }],
      { rules: {}, rejections: [rejection({ phrase: 'so the transport reconnects' })] },
      versions,
    );

    expect(applied).toStrictEqual([]);
  });

  it('suppresses a site across an inline code span, which the detector elides and the record keeps whole', () => {
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

  it('leaves a site whose span the recorded phrase does not cover', () => {
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

  it('suppresses a site that a live rejection covers, whatever a stale one recorded beside it says', () => {
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
  it("adds the run's rules to those recorded for a file whose prose is unchanged", () => {
    const prior: ProseRecord = { ...EMPTY, files: { 'docs/a.md': { hash: HASH, rules: ['sentence-case'] } } };

    const record = composeRecord(prior, fold({}), hasEverySite, hasEmDashDetector, new Map([['docs/a.md', HASH]]));

    expect(record.files?.['docs/a.md']).toStrictEqual({ hash: HASH, rules: ['em-dash', 'sentence-case'] });
  });

  it("replaces the rules recorded for a file whose prose changed with the run's", () => {
    const prior: ProseRecord = { ...EMPTY, files: { 'docs/a.md': { hash: HASH, rules: ['sentence-case'] } } };

    const record = composeRecord(
      prior,
      fold({}),
      hasEverySite,
      hasEmDashDetector,
      new Map([['docs/a.md', 'f'.repeat(16)]]),
    );

    expect(record.files?.['docs/a.md']).toStrictEqual({ hash: 'f'.repeat(16), rules: ['em-dash'] });
  });

  it("drops a recorded file under the run's roots that the scan no longer yields, and carries one outside them", () => {
    const prior: ProseRecord = {
      ...EMPTY,
      files: { 'docs/gone.md': { hash: HASH, rules: ['em-dash'] }, 'src/kept.ts': { hash: HASH, rules: ['em-dash'] } },
    };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.files).toStrictEqual({ 'src/kept.ts': { hash: HASH, rules: ['em-dash'] } });
  });

  it('records files from the hashes when the prior record has no file table', () => {
    const record = composeRecord(EMPTY, fold({}), hasEverySite, hasEmDashDetector, new Map([['docs/a.md', HASH]]));

    expect(record.files).toStrictEqual({ 'docs/a.md': { hash: HASH, rules: ['em-dash'] } });
  });

  it("keeps a file edited after a wider sweep unswept when a narrowed run's roots do not contain it", () => {
    const wide = composeRecord(EMPTY, fold({}), hasEverySite, hasEmDashDetector, new Map([['src/notes.md', HASH]]));
    const narrowed = composeRecord(
      wide,
      fold({ roots: ['docs'] }),
      hasEverySite,
      hasEmDashDetector,
      new Map([['docs/a.md', HASH]]),
    );

    expect(
      listUnsweptRules(narrowed, new Map([['em-dash', '1']]), hasEmDashDetector, 'src/notes.md', 'e'.repeat(16)),
    ).toStrictEqual(['em-dash']);
  });

  it('records each rule that the run versioned, with whether the helper has its detector', () => {
    const record = composeRecord(EMPTY, fold({ rules: WRITING_RULES }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rules).toStrictEqual({
      'em-dash': { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['.'] },
      'sentence-case': { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] },
    });
  });

  it('sorts the roots that it records, so a rewrite does not depend on the order of the run', () => {
    const record = composeRecord(EMPTY, fold({ roots: ['src', 'docs'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rules['em-dash']?.roots).toStrictEqual(['docs', 'src']);
  });

  it("joins a narrowed run's roots onto those already recorded at the same version", () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ roots: ['docs'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['src'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rules['em-dash']).toStrictEqual(coverage({ 'swept-at': '2026-09-02', roots: ['docs', 'src'] }));
  });

  it('drops a joined root that another one already contains', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ roots: ['.'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rules['em-dash']?.roots).toStrictEqual(['.']);
  });

  it('replaces the recorded roots when the sweep version rises, the earlier sweep covering a rule that has changed', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ version: '1', roots: ['.'] }) }, rejections: [] };

    const record = composeRecord(
      prior,
      fold({ roots: ['docs'], rules: { 'em-dash': { unit: 'writing', version: '2' } } }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(record.rules['em-dash']).toMatchObject({ version: '2', roots: ['docs'] });
  });

  it('replaces the recorded roots when the detector state differs, the earlier sweep having seen other candidates', () => {
    const prior: ProseRecord = { rules: { 'em-dash': coverage({ detected: false, roots: ['docs'] }) }, rejections: [] };

    const record = composeRecord(prior, fold({ roots: ['src'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rules['em-dash']).toMatchObject({ detected: true, roots: ['src'] });
  });

  it('leaves the coverage and rejections of a rule that the run did not version untouched', () => {
    const prior: ProseRecord = {
      rules: { 'plain-speech': coverage({ version: '5', detected: false, 'swept-at': '2026-01-01' }) },
      rejections: [rejection({ rule: 'plain-speech', 'rule-version': '5' })],
    };

    const record = composeRecord(prior, fold({}), hasNoSite, hasEmDashDetector, NO_HASHES);

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
      NO_HASHES,
    );

    expect(record.rejections).toStrictEqual([standing]);
  });

  it('keeps every rejection whose site exists when the run swept the whole repository and reported none', () => {
    const inDocs = rejection({ file: 'docs/a.md' });
    const inSource = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { rules: {}, rejections: [inDocs, inSource] };

    const record = composeRecord(prior, fold({}), hasEverySite, hasEmDashDetector, NO_HASHES);

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
      NO_HASHES,
    );

    expect(consulted).toStrictEqual([current]);
  });

  it('records the phrase reported by the fold, at the sweep version of the rule that it names', () => {
    const record = composeRecord(
      EMPTY,
      fold({ rejections: [foldRejection({ phrase: 'The cache is cold, as a heading might read' })] }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(record.rejections[0]).toMatchObject({
      phrase: 'The cache is cold, as a heading might read',
      'rule-version': '1',
    });
  });

  it('refuses a fold whose rejection names a rule that it does not version', () => {
    expect(() =>
      composeRecord(
        EMPTY,
        fold({ rejections: [foldRejection({ rule: 'plain-speech' })] }),
        hasEverySite,
        hasEmDashDetector,
        NO_HASHES,
      ),
    ).toThrow(/which the fold does not version/);
  });

  it('retires the entry that it supersedes across a reflow, a rewrapped line naming the same site', () => {
    const standing = rejection({ phrase: 'The cache\n  is cold', ground: 'an earlier ground' });
    const prior: ProseRecord = { rules: {}, rejections: [standing] };

    const record = composeRecord(
      prior,
      fold({ rejections: [foldRejection()] }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(record.rejections).toStrictEqual([rejection()]);
  });

  it('keeps one entry per site when a raised version is followed by a re-rejection of the same site', () => {
    const older = rejection({ 'rule-version': '0' });
    const prior: ProseRecord = { rules: {}, rejections: [older] };

    const record = composeRecord(
      prior,
      fold({ rejections: [foldRejection()] }),
      hasEverySite,
      hasEmDashDetector,
      NO_HASHES,
    );

    expect(record.rejections).toHaveLength(1);
    expect(record.rejections[0]).toMatchObject({ 'rule-version': '1' });
  });

  it('keeps a rejection outside the roots swept by the run, whatever its site, the run never having revisited it', () => {
    const inside = rejection({ file: 'docs/a.md' });
    const outside = rejection({ file: 'src/b.ts', phrase: 'the level against which it is probed' });
    const prior: ProseRecord = { rules: {}, rejections: [inside, outside] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasNoSite, hasEmDashDetector, NO_HASHES);

    expect(record.rejections).toStrictEqual([outside]);
  });

  it('retires a rejection recorded at an older version under the swept roots, the run having reviewed it', () => {
    const prior: ProseRecord = { rules: {}, rejections: [rejection({ 'rule-version': '0' })] };

    const record = composeRecord(prior, fold({}), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rejections).toStrictEqual([]);
  });

  it('keeps a rejection recorded at an older version outside the swept roots, which the run did not review', () => {
    const older = rejection({ file: 'src/b.ts', 'rule-version': '0' });
    const prior: ProseRecord = { rules: {}, rejections: [older] };

    const record = composeRecord(prior, fold({ roots: ['docs'] }), hasEverySite, hasEmDashDetector, NO_HASHES);

    expect(record.rejections).toStrictEqual([older]);
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

/** Reports every rejection's site as gone. */
function hasNoSite(): boolean {
  return false;
}

/** Builds a rejection under `reduced-object-relative` naming the site of `candidate`, overriding named fields. */
function relativeRejection(overrides: Partial<RecordedRejection> = {}): RecordedRejection {
  return rejection({ rule: 'reduced-object-relative', phrase: 'the source that it names', ...overrides });
}

// endregion | Helpers

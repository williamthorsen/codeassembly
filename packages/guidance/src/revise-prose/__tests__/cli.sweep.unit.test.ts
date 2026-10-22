import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';

import { runDetect } from '../cli.ts';
import { LEGACY_STALE_VERSION } from '../convert-record.ts';
import { parseRecord, RECORD_PATH } from '../parse-record.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';
import {
  BOTH_RULES,
  bothRules,
  createFixtureRoot,
  expectSuccess,
  foldRejectingNothing,
  NO_VERSIONS,
  OBJECT_RELATIVE,
  recordFold,
  recordFor,
  rejectedPhrase,
  sweep,
  writeRecord,
} from '../test-utils/sweep-fixtures.ts';
import type { LegacyRecord, ProseRecord } from '../types.ts';

/** Every field that the helper's candidates included before rules were introduced. */
const LEGACY_CANDIDATE_FIELDS: ReadonlyArray<string> = [
  'file',
  'head',
  'line',
  'phrase',
  'sentence',
  'shape',
  'subject',
  'verb',
];

/** Every field that the helper's summary included before rules were introduced. */
const LEGACY_SUMMARY_FIELDS: ReadonlyArray<string> = ['byFile', 'byShape', 'filesScanned', 'filesSkipped', 'total'];

describe(runDetect, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await createFixtureRoot();
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('the pre-rules invocation', () => {
    it('keeps every field that it reported before, and adds the rule', async () => {
      const candidate = expectSuccess(await sweep(scratch)).candidates[0];

      expect(candidate).toBeDefined();
      for (const field of LEGACY_CANDIDATE_FIELDS) {
        expect(candidate, `candidate lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(candidate).toMatchObject({ rule: 'reduced-object-relative', file: 'docs/guide.md', head: 'source' });
    });

    it('keeps every summary field that it reported before, and adds the per-rule counts', async () => {
      const { summary } = expectSuccess(await sweep(scratch));

      for (const field of LEGACY_SUMMARY_FIELDS) {
        expect(summary, `summary lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(summary.byRule).toStrictEqual({
        apostrophes: 0,
        'em-dash': 0,
        'negative-quantifier': 0,
        'overused-word': 0,
        'reduced-object-relative': 1,
        'second-person': 0,
        so: 0,
        where: 0,
      });
    });

    it('detects the object relative alone when the invocation does not name a rule', async () => {
      const { candidates } = expectSuccess(await sweep(scratch));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['reduced-object-relative']);
    });

    it('sweeps past a malformed record, never having consulted it', async () => {
      await mkdir(path.join(scratch, '.agents'), { recursive: true });
      await writeFile(path.join(scratch, RECORD_PATH), 'units: [not, a, map]\n', 'utf8');

      expect(expectSuccess(await sweep(scratch)).candidates).toHaveLength(1);
    });

    it('does not read the record, so a repository with one sweeps as though it had none', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));

      expect(expectSuccess(await sweep(scratch)).candidates).toHaveLength(1);
      expect(expectSuccess(await sweep(scratch)).summary.batchesSkipped).toBe(0);
    });
  });

  describe('a rule-naming invocation', () => {
    it('detects only the rules that it names', async () => {
      const { candidates } = expectSuccess(
        await sweep(scratch, ['--unit', 'writing=2', '--rule', 'em-dash@1=writing']),
      );

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('detects both rules when both are named', async () => {
      const { summary } = expectSuccess(await sweep(scratch, bothRules()));

      expect(summary.byRule).toStrictEqual({
        apostrophes: 0,
        'em-dash': 1,
        'negative-quantifier': 0,
        'overused-word': 0,
        'reduced-object-relative': 1,
        'second-person': 0,
        so: 0,
        where: 0,
      });
    });

    it('reports which named rules it detected and which it does not have a detector for', async () => {
      const { rules } = expectSuccess(await sweep(scratch, [...bothRules(), '--rule', 'sentence-case@1=writing']));

      expect(rules).toStrictEqual({ detected: BOTH_RULES, undetected: ['sentence-case'] });
    });

    it('detects nothing when every named rule lacks a detector, rather than the legacy rule', async () => {
      const { candidates, rules } = expectSuccess(
        await sweep(scratch, ['--unit', 'writing=2', '--rule', 'sentence-case@1=writing']),
      );

      expect(candidates).toStrictEqual([]);
      expect(rules).toStrictEqual({ detected: [], undetected: ['sentence-case'] });
    });

    it('plans a batch over the whole scanned set, not the candidate-bearing subset', async () => {
      await writeFile(path.join(scratch, 'docs/quiet.md'), 'A file with no candidate at all.\n', 'utf8');
      const { batches } = expectSuccess(await sweep(scratch, bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('docs/quiet.md');
    });
  });

  describe('the record on read', () => {
    it("suppresses a rejection recorded at its rule's current version", async () => {
      await writeRecord(scratch, uncoveredRecordFor(await rejectedPhrase(scratch)));
      const { candidates } = expectSuccess(await sweep(scratch, bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('suppresses a rejection whose recorded phrase is wider than the span reported by the detector', async () => {
      const wider = OBJECT_RELATIVE.replace(/^The helper reports /, '').replace(/\.$/, '');
      expect(wider).toContain(await rejectedPhrase(scratch));
      await writeRecord(scratch, uncoveredRecordFor(wider));

      const { candidates } = expectSuccess(await sweep(scratch, bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('emits a rejection recorded at an older version of its rule, marked stale', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch), LEGACY_STALE_VERSION));
      const { candidates, summary } = expectSuccess(await sweep(scratch, bothRules()));

      expect(candidates.find((candidate) => candidate.rule === 'reduced-object-relative')?.stale).toBe(true);
      expect(summary.stale).toBe(1);
    });

    it('skips a batch every file of which the record covers at the current version', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const { summary } = expectSuccess(await sweep(scratch, bothRules()));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it('skips nothing when the record covers a different version', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch), '2'));

      expect(expectSuccess(await sweep(scratch, bothRules())).summary.batchesSkipped).toBe(0);
    });

    it('skips a covered batch although the run also names a rule without a detector, recorded as undetected', async () => {
      const record = recordFor(await rejectedPhrase(scratch));
      record.rules['sentence-case'] = { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] };
      await writeRecord(scratch, record);
      const { summary } = expectSuccess(await sweep(scratch, [...bothRules(), '--rule', 'sentence-case@1=writing']));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it('skips a covered batch although the run names a rule that does not declare a sweep version and was never recorded', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const { summary } = expectSuccess(await sweep(scratch, [...bothRules(), '--rule', 'sentence-case=writing']));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
    });

    it('skips a covered batch after a unit version change that does not raise any sweep version', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const { candidates, summary } = expectSuccess(await sweep(scratch, bothRules('3')));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(candidates).toStrictEqual([]);
    });

    it("dispatches again once one rule's sweep version rises, listing that rule alone and reporting only its candidates", async () => {
      await writeRecord(scratch, { ...recordFor(await rejectedPhrase(scratch)), rejections: [] });
      const { batches, candidates, summary } = expectSuccess(await sweep(scratch, raisedEmDash()));

      expect(summary.batchesSkipped).toBe(0);
      expect(batches.map((batch) => batch.unswept)).toStrictEqual([['em-dash']]);
      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('withholds a live rejection under a rule for which the batch is already swept', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));

      expect(expectSuccess(await sweep(scratch, raisedEmDash())).rejections).toStrictEqual([]);
    });

    it('keeps the candidates of a rule named without a version in a dispatched batch, without listing that rule', async () => {
      const argv = ['--unit', 'writing=2', '--rule', 'em-dash@1=writing', '--rule', 'reduced-object-relative=writing'];
      const { batches, candidates } = expectSuccess(await sweep(scratch, argv));

      expect(batches.map((batch) => batch.unswept)).toStrictEqual([['em-dash']]);
      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['reduced-object-relative', 'em-dash']);
    });

    it('reports every batch for a run that does not version any rule, whatever the record covers', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const { batches, summary } = expectSuccess(
        await sweep(scratch, ['--unit', 'writing=2', '--rule', 'em-dash=writing']),
      );

      expect(summary.batchesSkipped).toBe(0);
      expect(batches.map((batch) => batch.unswept)).toStrictEqual([[]]);
    });

    it('drops the candidates and rejections in the files of a batch that it does not report', async () => {
      const record = recordFor(await rejectedPhrase(scratch));
      for (const rule of BOTH_RULES) {
        record.rules[rule] = { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['docs'] };
      }
      // Under `em-dash`, the rejection leaves the object-relative candidate in `docs` for the run to remove when it
      // drops the batch.
      await writeRecord(scratch, {
        ...record,
        rejections: record.rejections.map((rejection) => ({ ...rejection, rule: 'em-dash' })),
      });
      // A one-byte budget puts each directory in a batch of its own, so the covered `docs` batch is dropped.
      const { batches, candidates, rejections } = expectSuccess(
        await sweep(scratch, [...bothRules(), '--batch-budget', '1']),
      );

      expect(batches.map((batch) => batch.files)).toStrictEqual([['src/notes.md']]);
      expect(candidates.map((candidate) => candidate.file)).toStrictEqual(['src/notes.md']);
      expect(rejections).toStrictEqual([]);
    });

    it("skips nothing when the record's sweep did not run a detector that the run has", async () => {
      const record = recordFor(await rejectedPhrase(scratch));
      record.rules['em-dash'] = { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] };
      await writeRecord(scratch, record);

      expect(expectSuccess(await sweep(scratch, bothRules())).summary.batchesSkipped).toBe(0);
    });

    it('skips nothing when the record covers a narrower root', async () => {
      const record = recordFor(await rejectedPhrase(scratch));
      for (const rule of BOTH_RULES) {
        record.rules[rule] = { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['docs'] };
      }
      await writeRecord(scratch, record);

      const { batches } = expectSuccess(await sweep(scratch, bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('src/notes.md');
    });

    it('reports a live rejection to the run, so the sweeper leaves the site alone', async () => {
      const phrase = await rejectedPhrase(scratch);
      await writeRecord(scratch, uncoveredRecordFor(phrase));

      expect(expectSuccess(await sweep(scratch, bothRules())).rejections).toStrictEqual([
        { rule: 'reduced-object-relative', file: 'docs/guide.md', phrase },
      ]);
    });

    it('withholds a rejection recorded at an older version of its rule, which re-opens its site', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch), LEGACY_STALE_VERSION));

      expect(expectSuccess(await sweep(scratch, bothRules())).rejections).toStrictEqual([]);
    });

    it('reports a rejection under a rule not covered by any detector', async () => {
      const phrase = 'a figure the document displays on purpose';
      await writeRecord(scratch, {
        rules: {},
        rejections: [
          {
            rule: 'plain-speech',
            'rule-version': '6',
            file: 'docs/guide.md',
            phrase,
            ground: 'a marked exhibit of the construction',
          },
        ],
      });
      const argv = [...bothRules(), '--unit', 'plain-speech=6', '--rule', 'plain-speech@6=plain-speech'];

      expect(expectSuccess(await sweep(scratch, argv)).rejections).toStrictEqual([
        { rule: 'plain-speech', file: 'docs/guide.md', phrase },
      ]);
    });

    it('reports a malformed record as a structured failure rather than sweeping past it', async () => {
      await mkdir(path.join(scratch, '.agents'), { recursive: true });
      await writeFile(path.join(scratch, RECORD_PATH), 'units: [not, a, map]\n', 'utf8');

      expect(await sweep(scratch, bothRules())).toMatchObject({ ok: false, error: 'invalid-record' });
    });
  });

  describe('a record keyed on unit versions', () => {
    it("reads coverage at the unit's current version as current for each of its versioned rules", async () => {
      await writeLegacyRecord(scratch, legacyRecordFor(await rejectedPhrase(scratch)));
      const { summary } = expectSuccess(await sweep(scratch, bothRules()));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it("reads a rejection at the unit's current version as current for its rule", async () => {
      // Coverage of `src` alone leaves both rules unswept in the batch containing `docs/guide.md`.
      await writeLegacyRecord(scratch, legacyRecordFor(await rejectedPhrase(scratch), ['src']));
      const { candidates } = expectSuccess(await sweep(scratch, bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('reads coverage at an older unit version as unswept, with its rejections stale', async () => {
      await writeLegacyRecord(scratch, legacyRecordFor(await rejectedPhrase(scratch)));
      const { candidates, summary } = expectSuccess(await sweep(scratch, bothRules('3')));

      expect(summary.batchesSkipped).toBe(0);
      expect(candidates.find((candidate) => candidate.rule === 'reduced-object-relative')?.stale).toBe(true);
    });

    it('is rewritten in the per-rule shape by the next record, keeping its coverage and rejections', async () => {
      const phrase = await rejectedPhrase(scratch);
      await writeLegacyRecord(scratch, legacyRecordFor(phrase));

      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      const content = await readFile(path.join(scratch, RECORD_PATH), 'utf8');
      expect(content).not.toMatch(/^units:/m);
      const written = parseRecord(content, NO_VERSIONS);
      expect(written.rules['em-dash']).toMatchObject({ version: '1', detected: true, roots: ['.'] });
      expect(written.rejections).toMatchObject([{ rule: 'reduced-object-relative', 'rule-version': '1', phrase }]);
    });
  });

  it('reports a root outside a git working tree as a structured failure', async () => {
    const result = await runDetect({ argv: [], root: scratch, home: scratch }, makeFakeGit({ notARepository: true }));

    expect(result).toMatchObject({ ok: false, error: 'not-a-repository' });
  });
});

// region | Helpers

/**
 * A record keyed on unit versions, covering `roots` for unit `writing` at version 2 with both detectors run, and
 * rejecting the object-relative site at that version.
 */
function legacyRecordFor(phrase: string, roots: readonly string[] = ['.']): LegacyRecord {
  return {
    units: { writing: { version: '2', 'swept-at': '2026-09-02', rules: BOTH_RULES, roots } },
    rejections: [
      {
        rule: 'reduced-object-relative',
        unit: 'writing',
        'unit-version': '2',
        file: 'docs/guide.md',
        phrase,
        ground: 'a quoted exhibit of the construction',
      },
    ],
  };
}

/** The invocation naming both rules under unit `writing`, with `em-dash` raised to sweep version 2. */
function raisedEmDash(): string[] {
  return ['--unit', 'writing=2', '--rule', 'em-dash@2=writing', '--rule', 'reduced-object-relative@1=writing'];
}

/**
 * The record from `recordFor` without coverage, so that the sweep applies both rules to the batch containing the
 * rejected site.
 */
function uncoveredRecordFor(phrase: string): ProseRecord {
  return { ...recordFor(phrase), rules: {} };
}

/** Writes a record keyed on unit versions into the fixture tree, as a sweep before rules were versioned did. */
async function writeLegacyRecord(root: string, record: LegacyRecord): Promise<void> {
  await mkdir(path.join(root, '.agents'), { recursive: true });
  await writeFile(path.join(root, RECORD_PATH), stringifyYaml(record), 'utf8');
}

// endregion | Helpers

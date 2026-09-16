import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify as stringifyYaml } from 'yaml';

import { runDetect, runRecord } from '../cli.ts';
import { LEGACY_STALE_VERSION } from '../convert-record.ts';
import { parseRecord, RECORD_PATH, stringifyRecord } from '../record.ts';
import type { DetectResult, DetectSuccess, LegacyRecord, ProseRecord, RunFold, SweepVersions } from '../types.ts';

/** The detector rules that `bothRules` names under unit `writing`. */
const BOTH_RULES: ReadonlyArray<string> = ['em-dash', 'reduced-object-relative'];

/** What a written record is read back against: no versions, which a record in the per-rule shape needs none of. */
const NO_VERSIONS: SweepVersions = { units: new Map(), rules: new Map() };

const OBJECT_RELATIVE = 'The helper reports the source it names.';
const EM_DASH_SENTENCE = 'The cache is cold\u{2014}so the transport reconnects.';

/**
 * A fixture tree containing one site of each rule, in two directories, so that batching and per-file coverage both
 * have something to separate.
 */
const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': `${OBJECT_RELATIVE}\n`,
  'src/notes.md': `${EM_DASH_SENTENCE}\n`,
};

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
    scratch = await mkdtemp(path.join(tmpdir(), 'revise-prose-cli-'));
    execFileSync('git', ['-C', scratch, 'init', '--quiet']);
    for (const [file, content] of Object.entries(FIXTURE_FILES)) {
      await mkdir(path.join(scratch, path.dirname(file)), { recursive: true });
      await writeFile(path.join(scratch, file), content, 'utf8');
    }
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('the pre-rules invocation', () => {
    it('keeps every field that it reported before, and adds the rule', async () => {
      const candidate = expectSuccess(await sweep()).candidates[0];

      expect(candidate).toBeDefined();
      for (const field of LEGACY_CANDIDATE_FIELDS) {
        expect(candidate, `candidate lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(candidate).toMatchObject({ rule: 'reduced-object-relative', file: 'docs/guide.md', head: 'source' });
    });

    it('keeps every summary field that it reported before, and adds the per-rule counts', async () => {
      const { summary } = expectSuccess(await sweep());

      for (const field of LEGACY_SUMMARY_FIELDS) {
        expect(summary, `summary lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(summary.byRule).toStrictEqual({
        'em-dash': 0,
        'reduced-object-relative': 1,
        'second-person': 0,
        so: 0,
        where: 0,
      });
    });

    it('detects the object relative alone, naming no rule', async () => {
      const { candidates } = expectSuccess(await sweep());

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['reduced-object-relative']);
    });

    it('sweeps past a malformed record, never having consulted it', async () => {
      await mkdir(path.join(scratch, '.agents'), { recursive: true });
      await writeFile(path.join(scratch, RECORD_PATH), 'units: [not, a, map]\n', 'utf8');

      expect(expectSuccess(await sweep()).candidates).toHaveLength(1);
    });

    it('reads no record, so a repository with one sweeps as though it had none', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));

      expect(expectSuccess(await sweep()).candidates).toHaveLength(1);
      expect(expectSuccess(await sweep()).summary.batchesSkipped).toBe(0);
    });
  });

  describe('a rule-naming invocation', () => {
    it('detects only the rules that it names', async () => {
      const { candidates } = expectSuccess(await sweep(['--unit', 'writing=2', '--rule', 'em-dash@1=writing']));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('detects both rules when both are named', async () => {
      const { summary } = expectSuccess(await sweep(bothRules()));

      expect(summary.byRule).toStrictEqual({
        'em-dash': 1,
        'reduced-object-relative': 1,
        'second-person': 0,
        so: 0,
        where: 0,
      });
    });

    it('reports which named rules it detected and which it has no detector for', async () => {
      const { rules } = expectSuccess(await sweep([...bothRules(), '--rule', 'sentence-case@1=writing']));

      expect(rules).toStrictEqual({ detected: BOTH_RULES, undetected: ['sentence-case'] });
    });

    it('detects nothing when every named rule lacks a detector, rather than the legacy rule', async () => {
      const { candidates, rules } = expectSuccess(
        await sweep(['--unit', 'writing=2', '--rule', 'sentence-case@1=writing']),
      );

      expect(candidates).toStrictEqual([]);
      expect(rules).toStrictEqual({ detected: [], undetected: ['sentence-case'] });
    });

    it('plans a batch over the whole scanned set, not the candidate-bearing subset', async () => {
      await writeFile(path.join(scratch, 'docs/quiet.md'), 'A file with no candidate at all.\n', 'utf8');
      const { batches } = expectSuccess(await sweep(bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('docs/quiet.md');
    });
  });

  describe('the record on read', () => {
    it("suppresses a rejection recorded at its rule's current version", async () => {
      await writeRecord(uncoveredRecordFor(await rejectedPhrase()));
      const { candidates } = expectSuccess(await sweep(bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('suppresses a rejection whose recorded phrase runs wider than the span reported by the detector', async () => {
      const wider = OBJECT_RELATIVE.replace(/^The helper reports /, '').replace(/\.$/, '');
      expect(wider).toContain(await rejectedPhrase());
      await writeRecord(uncoveredRecordFor(wider));

      const { candidates } = expectSuccess(await sweep(bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('emits a rejection recorded at an older version of its rule, marked stale', async () => {
      await writeRecord(recordFor(await rejectedPhrase(), LEGACY_STALE_VERSION));
      const { candidates, summary } = expectSuccess(await sweep(bothRules()));

      expect(candidates.find((candidate) => candidate.rule === 'reduced-object-relative')?.stale).toBe(true);
      expect(summary.stale).toBe(1);
    });

    it('skips a batch every file of which the record covers at the current version', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const { summary } = expectSuccess(await sweep(bothRules()));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it('skips nothing when the record covers a different version', async () => {
      await writeRecord(recordFor(await rejectedPhrase(), '2'));

      expect(expectSuccess(await sweep(bothRules())).summary.batchesSkipped).toBe(0);
    });

    it('skips a covered batch although the run also names a rule without a detector, recorded as undetected', async () => {
      const record = recordFor(await rejectedPhrase());
      record.rules['sentence-case'] = { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] };
      await writeRecord(record);
      const { summary } = expectSuccess(await sweep([...bothRules(), '--rule', 'sentence-case@1=writing']));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it('skips a covered batch although the run names a rule that declares no sweep version and was never recorded', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const { summary } = expectSuccess(await sweep([...bothRules(), '--rule', 'sentence-case=writing']));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
    });

    it('skips a covered batch after a unit version change that raises no sweep version', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const { candidates, summary } = expectSuccess(await sweep(bothRules('3')));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(candidates).toStrictEqual([]);
    });

    it("dispatches again once one rule's sweep version rises, listing that rule alone and reporting only its candidates", async () => {
      await writeRecord({ ...recordFor(await rejectedPhrase()), rejections: [] });
      const { batches, candidates, summary } = expectSuccess(await sweep(raisedEmDash()));

      expect(summary.batchesSkipped).toBe(0);
      expect(batches.map((batch) => batch.unswept)).toStrictEqual([['em-dash']]);
      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('withholds a live rejection under a rule for which the batch is already swept', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));

      expect(expectSuccess(await sweep(raisedEmDash())).rejections).toStrictEqual([]);
    });

    it('keeps the candidates of a rule named without a version in a dispatched batch, listing no such rule', async () => {
      const argv = ['--unit', 'writing=2', '--rule', 'em-dash@1=writing', '--rule', 'reduced-object-relative=writing'];
      const { batches, candidates } = expectSuccess(await sweep(argv));

      expect(batches.map((batch) => batch.unswept)).toStrictEqual([['em-dash']]);
      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['reduced-object-relative', 'em-dash']);
    });

    it('reports every batch for a run that versions no rule, whatever the record covers', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const { batches, summary } = expectSuccess(await sweep(['--unit', 'writing=2', '--rule', 'em-dash=writing']));

      expect(summary.batchesSkipped).toBe(0);
      expect(batches.map((batch) => batch.unswept)).toStrictEqual([[]]);
    });

    it('drops the candidates and rejections in the files of a batch that it does not report', async () => {
      const record = recordFor(await rejectedPhrase());
      for (const rule of BOTH_RULES) {
        record.rules[rule] = { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['docs'] };
      }
      // Under `em-dash`, the rejection leaves the object-relative candidate in `docs` for the dropped batch to remove.
      await writeRecord({
        ...record,
        rejections: record.rejections.map((rejection) => ({ ...rejection, rule: 'em-dash' })),
      });
      // A one-byte budget puts each directory in a batch of its own, so the covered `docs` batch is dropped.
      const { batches, candidates, rejections } = expectSuccess(await sweep([...bothRules(), '--batch-budget', '1']));

      expect(batches.map((batch) => batch.files)).toStrictEqual([['src/notes.md']]);
      expect(candidates.map((candidate) => candidate.file)).toStrictEqual(['src/notes.md']);
      expect(rejections).toStrictEqual([]);
    });

    it("skips nothing when the record's sweep did not run a detector that the run has", async () => {
      const record = recordFor(await rejectedPhrase());
      record.rules['em-dash'] = { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] };
      await writeRecord(record);

      expect(expectSuccess(await sweep(bothRules())).summary.batchesSkipped).toBe(0);
    });

    it('skips nothing when the record covers a narrower root', async () => {
      const record = recordFor(await rejectedPhrase());
      for (const rule of BOTH_RULES) {
        record.rules[rule] = { version: '1', 'swept-at': '2026-09-02', detected: true, roots: ['docs'] };
      }
      await writeRecord(record);

      const { batches } = expectSuccess(await sweep(bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('src/notes.md');
    });

    it('reports a live rejection to the run, so the sweeper leaves the site alone', async () => {
      const phrase = await rejectedPhrase();
      await writeRecord(uncoveredRecordFor(phrase));

      expect(expectSuccess(await sweep(bothRules())).rejections).toStrictEqual([
        { rule: 'reduced-object-relative', file: 'docs/guide.md', phrase },
      ]);
    });

    it('withholds a rejection recorded at an older version of its rule, which re-opens its site', async () => {
      await writeRecord(recordFor(await rejectedPhrase(), LEGACY_STALE_VERSION));

      expect(expectSuccess(await sweep(bothRules())).rejections).toStrictEqual([]);
    });

    it('reports a rejection under a rule covered by no detector', async () => {
      const phrase = 'a figure the document displays on purpose';
      await writeRecord({
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

      expect(expectSuccess(await sweep(argv)).rejections).toStrictEqual([
        { rule: 'plain-speech', file: 'docs/guide.md', phrase },
      ]);
    });

    it('reports a malformed record as a structured failure rather than sweeping past it', async () => {
      await mkdir(path.join(scratch, '.agents'), { recursive: true });
      await writeFile(path.join(scratch, RECORD_PATH), 'units: [not, a, map]\n', 'utf8');

      expect(await sweep(bothRules())).toMatchObject({ ok: false, error: 'invalid-record' });
    });
  });

  describe('a record keyed on unit versions', () => {
    it("reads coverage at the unit's current version as current for each of its versioned rules", async () => {
      await writeLegacyRecord(legacyRecordFor(await rejectedPhrase()));
      const { summary } = expectSuccess(await sweep(bothRules()));

      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });

    it("reads a rejection at the unit's current version as current for its rule", async () => {
      // Coverage of `src` alone leaves the batch holding `docs/guide.md` to apply both rules.
      await writeLegacyRecord(legacyRecordFor(await rejectedPhrase(), ['src']));
      const { candidates } = expectSuccess(await sweep(bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('reads coverage at an older unit version as unswept, with its rejections stale', async () => {
      await writeLegacyRecord(legacyRecordFor(await rejectedPhrase()));
      const { candidates, summary } = expectSuccess(await sweep(bothRules('3')));

      expect(summary.batchesSkipped).toBe(0);
      expect(candidates.find((candidate) => candidate.rule === 'reduced-object-relative')?.stale).toBe(true);
    });

    it('is rewritten in the per-rule shape by the next record, keeping its coverage and rejections', async () => {
      const phrase = await rejectedPhrase();
      await writeLegacyRecord(legacyRecordFor(phrase));

      runRecord({ foldJson: JSON.stringify(await foldRejectingNothing()), root: scratch });

      const content = await readFile(path.join(scratch, RECORD_PATH), 'utf8');
      expect(content).not.toMatch(/^units:/m);
      const written = parseRecord(content, NO_VERSIONS);
      expect(written.rules['em-dash']).toMatchObject({ version: '1', detected: true, roots: ['.'] });
      expect(written.rejections).toMatchObject([{ rule: 'reduced-object-relative', 'rule-version': '1', phrase }]);
    });
  });

  describe(runRecord, () => {
    it('writes a record that the next run reads back', async () => {
      const result = runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });

      expect(result).toMatchObject({ ok: true, path: RECORD_PATH, rules: 2, rejections: 1 });
      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
      expect(written.rejections[0]).toMatchObject({
        rule: 'reduced-object-relative',
        phrase: await rejectedPhrase(),
        'rule-version': '1',
      });
    });

    it('writes the same bytes for the same fold, so a re-record leaves no diff', async () => {
      runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });
      const first = await readFile(path.join(scratch, RECORD_PATH), 'utf8');
      runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });

      expect(await readFile(path.join(scratch, RECORD_PATH), 'utf8')).toBe(first);
    });

    it('reports a malformed fold as a structured failure and writes nothing', async () => {
      const result = runRecord({ foldJson: '{"sweptAt": "yesterday"}', root: scratch });

      expect(result).toMatchObject({ ok: false, error: 'invalid-record' });
      await expect(readFile(path.join(scratch, RECORD_PATH), 'utf8')).rejects.toThrow();
    });

    it('refuses a fold whose rejection names a rule that it does not version and writes nothing', async () => {
      const base = await fold();
      const unversioned = { ...base, rejections: [{ ...base.rejections[0], rule: 'sentence-case' }] };

      expect(runRecord({ foldJson: JSON.stringify(unversioned), root: scratch })).toMatchObject({
        ok: false,
        error: 'invalid-record',
      });
      await expect(readFile(path.join(scratch, RECORD_PATH), 'utf8')).rejects.toThrow();
    });

    it('keeps an inherited rejection whose phrase the file still contains, though the run reported none', async () => {
      const phrase = await rejectedPhrase();
      await writeRecord(recordFor(phrase));

      runRecord({ foldJson: JSON.stringify(await foldRejectingNothing()), root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual([phrase]);
    });

    it('drops an inherited rejection once the file no longer contains its phrase', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const foldJson = JSON.stringify(await foldRejectingNothing());
      await writeFile(path.join(scratch, 'docs/guide.md'), 'The helper reports the source that it names.\n', 'utf8');

      runRecord({ foldJson, root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual([]);
    });

    it('drops an inherited rejection whose file is gone', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const foldJson = JSON.stringify(await foldRejectingNothing());
      await rm(path.join(scratch, 'docs/guide.md'));

      runRecord({ foldJson, root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual([]);
    });

    it('keeps an inherited rejection whose phrase runs across a wrapped block comment', async () => {
      const file = 'src/wrapped.ts';
      await writeFile(
        path.join(scratch, file),
        '/**\n * Resolves the source\n * it names in the header.\n */\nexport const header = 1;\n',
        'utf8',
      );
      await writeRecord(recordFor('the source it names', '1', file));

      runRecord({ foldJson: JSON.stringify(await foldRejectingNothing()), root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual(['the source it names']);
    });

    it("keeps an inherited rejection whose phrase elides an inline code span, as a candidate's sentence does", async () => {
      const file = 'docs/reasons.md';
      const phrase = 'the «codespan» reasons it lists';
      await writeFile(path.join(scratch, file), 'Each check reports the `unavailable` reasons it lists.\n', 'utf8');
      await writeRecord(recordFor(phrase, '1', file));

      runRecord({ foldJson: JSON.stringify(await foldRejectingNothing()), root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual([phrase]);
    });

    it('keeps an inherited rejection whose phrase contains an inline code span as the source writes it', async () => {
      const file = 'docs/reasons.md';
      const phrase = 'the `unavailable` reasons it lists';
      await writeFile(path.join(scratch, file), `Each check reports ${phrase}.\n`, 'utf8');
      await writeRecord(recordFor(phrase, '1', file));

      runRecord({ foldJson: JSON.stringify(await foldRejectingNothing()), root: scratch });

      expect(await readRecordedPhrases()).toStrictEqual([phrase]);
    });

    it('closes the loop: Recording a run suppresses its candidate on the next sweep', async () => {
      expect(expectSuccess(await sweep(bothRules())).summary.byRule['reduced-object-relative']).toBe(1);

      runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });

      expect(expectSuccess(await sweep(bothRules())).summary.byRule['reduced-object-relative']).toBe(0);
    });

    it("records whether each rule's detector ran, and a rejection under a rule without a detector", async () => {
      const undetected = await foldNamingUndetected();

      runRecord({ foldJson: JSON.stringify(undetected), root: scratch });

      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
      expect(written.rules['em-dash']?.detected).toBe(true);
      expect(written.rules['sentence-case']?.detected).toBe(false);
      expect(written.rejections.map((rejection) => rejection.rule)).toContain('sentence-case');
    });

    it('closes the loop for a run naming a rule without a detector: The next sweep skips what it covered', async () => {
      const argv = [...bothRules(), '--rule', 'sentence-case@1=writing'];

      runRecord({ foldJson: JSON.stringify(await foldNamingUndetected()), root: scratch });

      const { summary } = expectSuccess(await sweep(argv));
      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });
  });

  it('reports a root outside a git working tree as a structured failure', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'revise-prose-bare-'));
    try {
      expect(await runDetect({ argv: [], root: outside, home: outside })).toMatchObject({
        ok: false,
        error: 'not-a-repository',
      });
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  // region | Helpers

  /** The invocation naming both rules at sweep version 1 under unit `writing` at `unitVersion`, which most assertions read. */
  function bothRules(unitVersion = '2'): string[] {
    return [
      '--unit',
      `writing=${unitVersion}`,
      '--rule',
      'em-dash@1=writing',
      '--rule',
      'reduced-object-relative@1=writing',
    ];
  }

  /** A fold rejecting the fixture's object-relative site, which the record round-trip assertions read. */
  async function fold(): Promise<RunFold> {
    return {
      sweptAt: '2026-09-02',
      roots: ['.'],
      units: { writing: '2' },
      rules: {
        'em-dash': { unit: 'writing', version: '1' },
        'reduced-object-relative': { unit: 'writing', version: '1' },
      },
      rejections: [
        {
          rule: 'reduced-object-relative',
          file: 'docs/guide.md',
          phrase: await rejectedPhrase(),
          ground: 'a quoted exhibit of the construction',
        },
      ],
    };
  }

  /** The fold from `fold`, naming `sentence-case` beside the detector rules and rejecting one site under it. */
  async function foldNamingUndetected(): Promise<RunFold> {
    const base = await fold();
    return {
      ...base,
      rules: { ...base.rules, 'sentence-case': { unit: 'writing', version: '1' } },
      rejections: [
        ...base.rejections,
        {
          rule: 'sentence-case',
          file: 'src/notes.md',
          phrase: 'The cache is cold',
          ground: 'a sentence, not a heading',
        },
      ],
    };
  }

  /** The fold from `fold`, reporting no rejection, as a run reports a batch that leaves every inherited site alone. */
  async function foldRejectingNothing(): Promise<RunFold> {
    return { ...(await fold()), rejections: [] };
  }

  /** The invocation naming both rules under unit `writing`, with `em-dash` raised to sweep version 2. */
  function raisedEmDash(): string[] {
    return ['--unit', 'writing=2', '--rule', 'em-dash@2=writing', '--rule', 'reduced-object-relative@1=writing'];
  }

  /** Reads back the phrases of the rejections in the written record. */
  async function readRecordedPhrases(): Promise<string[]> {
    const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
    return written.rejections.map((rejection) => rejection.phrase);
  }

  /**
   * The phrase reported by the detector for the fixture's object-relative site. Read from a sweep rather than
   * written out, so that a change to the span that a detector reports fails the assertion instead of silently
   * missing the rejection.
   */
  async function rejectedPhrase(): Promise<string> {
    const candidate = expectSuccess(await sweep()).candidates[0];
    if (candidate === undefined) throw new Error('the fixture yielded no object-relative candidate');
    return candidate.phrase;
  }

  /** Sweeps the fixture repository, anchoring `home` at the scratch tree so that the run reads no real preferences. */
  async function sweep(argv: readonly string[] = []): Promise<DetectResult> {
    return runDetect({ argv, root: scratch, home: scratch });
  }

  /** Writes a record keyed on unit versions into the fixture repository, as a sweep before rules were versioned did. */
  async function writeLegacyRecord(record: LegacyRecord): Promise<void> {
    await mkdir(path.join(scratch, '.agents'), { recursive: true });
    await writeFile(path.join(scratch, RECORD_PATH), stringifyYaml(record), 'utf8');
  }

  /** Writes a record into the fixture repository. */
  async function writeRecord(record: ProseRecord): Promise<void> {
    await mkdir(path.join(scratch, '.agents'), { recursive: true });
    await writeFile(path.join(scratch, RECORD_PATH), stringifyRecord(record), 'utf8');
  }

  // endregion | Helpers
});

// region | Helpers

/** Narrows a result to its success arm, failing the test with the helper's own message when it is not one. */
function expectSuccess(result: DetectResult): DetectSuccess {
  if (!result.ok) {
    throw new Error(`expected a successful sweep, got ${result.error}: ${result.message}`);
  }
  return result;
}

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

/** A record covering the whole repository for both rules at `version`, rejecting one site in `file` at that version. */
function recordFor(phrase: string, version = '1', file = 'docs/guide.md'): ProseRecord {
  const coverage = { version, 'swept-at': '2026-09-02', detected: true, roots: ['.'] };
  return {
    rules: Object.fromEntries(BOTH_RULES.map((rule) => [rule, coverage])),
    rejections: [
      {
        rule: 'reduced-object-relative',
        'rule-version': version,
        file,
        phrase,
        ground: 'a quoted exhibit of the construction',
      },
    ],
  };
}

/** The record from `recordFor` with no coverage, so that the batch holding the rejected site applies both rules. */
function uncoveredRecordFor(phrase: string): ProseRecord {
  return { ...recordFor(phrase), rules: {} };
}

// endregion | Helpers

import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runDetect, runRecord } from '../cli.ts';
import { hashPhrase, parseRecord, RECORD_PATH, stringifyRecord } from '../record.ts';
import type { DetectResult, DetectSuccess, ProseRecord, RunFold } from '../types.ts';

const OBJECT_RELATIVE = 'The helper reports the source it names.';
const EM_DASH_SENTENCE = 'The cache is cold\u{2014}so the transport reconnects.';

/**
 * A fixture tree carrying one site of each rule, in two directories, so batching and per-file coverage both have
 * something to separate.
 */
const FIXTURE_FILES: Readonly<Record<string, string>> = {
  'docs/guide.md': `${OBJECT_RELATIVE}\n`,
  'src/notes.md': `${EM_DASH_SENTENCE}\n`,
};

/** Every field the helper's candidates carried before rules were introduced. */
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

/** Every field the helper's summary carried before rules were introduced. */
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
    it('carries every field it reported before, and adds the rule', async () => {
      const candidate = expectSuccess(await sweep()).candidates[0];

      expect(candidate).toBeDefined();
      for (const field of LEGACY_CANDIDATE_FIELDS) {
        expect(candidate, `candidate lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(candidate).toMatchObject({ rule: 'reduced-object-relative', file: 'docs/guide.md', head: 'source' });
    });

    it('carries every summary field it reported before, and adds the per-rule counts', async () => {
      const { summary } = expectSuccess(await sweep());

      for (const field of LEGACY_SUMMARY_FIELDS) {
        expect(summary, `summary lost the legacy field "${field}"`).toHaveProperty(field);
      }
      expect(summary.byRule).toStrictEqual({ 'em-dash': 0, 'reduced-object-relative': 1 });
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
    it('detects only the rules it names', async () => {
      const { candidates } = expectSuccess(await sweep(['--unit', 'writing=2', '--rule', 'em-dash=writing']));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('detects both rules where both are named', async () => {
      const { summary } = expectSuccess(await sweep(bothRules()));

      expect(summary.byRule).toStrictEqual({ 'em-dash': 1, 'reduced-object-relative': 1 });
    });

    it('plans a batch over the whole scanned set, not the candidate-bearing subset', async () => {
      await writeFile(path.join(scratch, 'docs/quiet.md'), 'A file with no candidate at all.\n', 'utf8');
      const { batches } = expectSuccess(await sweep(bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('docs/quiet.md');
    });
  });

  describe('the record on read', () => {
    it('suppresses a rejection recorded at the current unit version', async () => {
      await writeRecord(recordFor(await rejectedPhrase()));
      const { candidates } = expectSuccess(await sweep(bothRules()));

      expect(candidates.map((candidate) => candidate.rule)).toStrictEqual(['em-dash']);
    });

    it('emits a rejection recorded at an older unit version, marked stale', async () => {
      await writeRecord(recordFor(await rejectedPhrase(), '1'));
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

    it('skips nothing where the record covers a different version', async () => {
      await writeRecord(recordFor(await rejectedPhrase(), '1'));

      expect(expectSuccess(await sweep(bothRules())).summary.batchesSkipped).toBe(0);
    });

    it('skips nothing where the record covers a narrower root', async () => {
      const record = recordFor(await rejectedPhrase());
      record.units['writing'] = { version: '2', 'swept-at': '2026-09-02', roots: ['docs'] };
      await writeRecord(record);

      const { batches } = expectSuccess(await sweep(bothRules()));

      expect(batches.flatMap((batch) => batch.files)).toContain('src/notes.md');
    });

    it('reports a malformed record as a structured failure rather than sweeping past it', async () => {
      await mkdir(path.join(scratch, '.agents'), { recursive: true });
      await writeFile(path.join(scratch, RECORD_PATH), 'units: [not, a, map]\n', 'utf8');

      expect(await sweep(bothRules())).toMatchObject({ ok: false, error: 'invalid-record' });
    });
  });

  describe(runRecord, () => {
    it('writes a record the next run reads back', async () => {
      const result = runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });

      expect(result).toMatchObject({ ok: true, path: RECORD_PATH, units: 1, rejections: 1 });
      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'));
      expect(written.rejections[0]).toMatchObject({
        rule: 'reduced-object-relative',
        hash: hashPhrase(await rejectedPhrase()),
        'unit-version': '2',
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

    it('closes the loop: recording a run suppresses its candidate on the next sweep', async () => {
      expect(expectSuccess(await sweep(bothRules())).summary.byRule['reduced-object-relative']).toBe(1);

      runRecord({ foldJson: JSON.stringify(await fold()), root: scratch });

      expect(expectSuccess(await sweep(bothRules())).summary.byRule['reduced-object-relative']).toBe(0);
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

  /** The invocation naming both rules under one unit, which most assertions above read. */
  function bothRules(): string[] {
    return ['--unit', 'writing=2', '--rule', 'em-dash=writing', '--rule', 'reduced-object-relative=writing'];
  }

  /** A fold rejecting the fixture's object-relative site, which the record round-trip assertions read. */
  async function fold(): Promise<RunFold> {
    return {
      sweptAt: '2026-09-02',
      units: { writing: { version: '2', roots: ['.'] } },
      rejections: [
        {
          rule: 'reduced-object-relative',
          unit: 'writing',
          file: 'docs/guide.md',
          phrase: await rejectedPhrase(),
          ground: 'a quoted exhibit of the construction',
        },
      ],
    };
  }

  /**
   * The phrase the detector reports for the fixture's object-relative site. Read from a sweep rather than written out,
   * so a change to the span a detector reports fails the assertion instead of silently missing the rejection.
   */
  async function rejectedPhrase(): Promise<string> {
    const candidate = expectSuccess(await sweep()).candidates[0];
    if (candidate === undefined) throw new Error('the fixture yielded no object-relative candidate');
    return candidate.phrase;
  }

  /** Sweeps the fixture repository, anchoring `home` at the scratch tree so no real preferences reach the run. */
  async function sweep(argv: readonly string[] = []): Promise<DetectResult> {
    return runDetect({ argv, root: scratch, home: scratch });
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

/** A record covering the whole repository for unit `writing`, rejecting one site at `version`. */
function recordFor(phrase: string, version = '2'): ProseRecord {
  return {
    units: { writing: { version, 'swept-at': '2026-09-02', roots: ['.'] } },
    rejections: [
      {
        rule: 'reduced-object-relative',
        unit: 'writing',
        'unit-version': version,
        file: 'docs/guide.md',
        phrase,
        hash: hashPhrase(phrase),
        ground: 'a quoted exhibit of the construction',
      },
    ],
  };
}

// endregion | Helpers

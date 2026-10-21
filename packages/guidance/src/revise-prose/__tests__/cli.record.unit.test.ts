import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { runDetect, runRecord } from '../cli.ts';
import { parseRecord, RECORD_PATH } from '../parse-record.ts';
import { makeFakeGit } from '../test-utils/make-fake-git.ts';
import {
  BOTH_RULES,
  bothRules,
  createFixtureRoot,
  expectSuccess,
  fold,
  foldRejectingNothing,
  NO_VERSIONS,
  OBJECT_RELATIVE,
  recordFold,
  recordFor,
  rejectedPhrase,
  sweep,
  writeRecord,
} from '../test-utils/sweep-fixtures.ts';
import type { RunFold } from '../types.ts';

/**
 * The record schema of the helper deployed before files were hashed, frozen here so that a record written now is checked
 * against what that helper reads: non-strict objects, requiring `swept-at` and `roots` on each rule.
 */
const PRIOR_RECORD_SCHEMA = z.object({
  rules: z
    .record(
      z.string(),
      z.object({
        version: z.string().min(1),
        'swept-at': z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        detected: z.boolean(),
        roots: z.array(z.string().min(1)).min(1),
      }),
    )
    .default({}),
  rejections: z.array(z.object({ rule: z.string(), 'rule-version': z.string(), file: z.string() })).default([]),
});

describe(runDetect, () => {
  let scratch: string;

  beforeEach(async () => {
    scratch = await createFixtureRoot();
  });

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe(runRecord, () => {
    it('writes a record that the next run reads back', async () => {
      const result = await recordFold(scratch, JSON.stringify(await fold(scratch)));

      expect(result).toMatchObject({ ok: true, path: RECORD_PATH, rules: 2, rejections: 1 });
      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
      expect(written.rejections[0]).toMatchObject({
        rule: 'reduced-object-relative',
        phrase: await rejectedPhrase(scratch),
        'rule-version': '1',
      });
    });

    it('writes the same bytes for the same fold, so a re-record does not leave a diff', async () => {
      await recordFold(scratch, JSON.stringify(await fold(scratch)));
      const first = await readFile(path.join(scratch, RECORD_PATH), 'utf8');
      await recordFold(scratch, JSON.stringify(await fold(scratch)));

      expect(await readFile(path.join(scratch, RECORD_PATH), 'utf8')).toBe(first);
    });

    it('reports a malformed fold as a structured failure and writes nothing', async () => {
      const result = await recordFold(scratch, '{"sweptAt": "yesterday"}');

      expect(result).toMatchObject({ ok: false, error: 'invalid-record' });
      await expect(readFile(path.join(scratch, RECORD_PATH), 'utf8')).rejects.toThrow();
    });

    it('refuses a fold whose rejection names a rule that it does not version and writes nothing', async () => {
      const base = await fold(scratch);
      const unversioned = { ...base, rejections: [{ ...base.rejections[0], rule: 'sentence-case' }] };

      expect(await recordFold(scratch, JSON.stringify(unversioned))).toMatchObject({
        ok: false,
        error: 'invalid-record',
      });
      await expect(readFile(path.join(scratch, RECORD_PATH), 'utf8')).rejects.toThrow();
    });

    it('keeps an inherited rejection whose phrase the file still contains, though the run reported none', async () => {
      const phrase = await rejectedPhrase(scratch);
      await writeRecord(scratch, recordFor(phrase));

      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      expect(await readRecordedPhrases(scratch)).toStrictEqual([phrase]);
    });

    it('drops an inherited rejection once the file no longer contains its phrase', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const foldJson = JSON.stringify(await foldRejectingNothing(scratch));
      await writeFile(path.join(scratch, 'docs/guide.md'), 'The helper reports the source that it names.\n', 'utf8');

      await recordFold(scratch, foldJson);

      expect(await readRecordedPhrases(scratch)).toStrictEqual([]);
    });

    it('drops an inherited rejection whose file is gone', async () => {
      await writeRecord(scratch, recordFor(await rejectedPhrase(scratch)));
      const foldJson = JSON.stringify(await foldRejectingNothing(scratch));
      await rm(path.join(scratch, 'docs/guide.md'));

      await recordFold(scratch, foldJson);

      expect(await readRecordedPhrases(scratch)).toStrictEqual([]);
    });

    it('keeps an inherited rejection whose phrase runs across a wrapped block comment', async () => {
      const file = 'src/wrapped.ts';
      await writeFile(
        path.join(scratch, file),
        '/**\n * Resolves the source\n * it names in the header.\n */\nexport const header = 1;\n',
        'utf8',
      );
      await writeRecord(scratch, recordFor('the source it names', '1', file));

      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      expect(await readRecordedPhrases(scratch)).toStrictEqual(['the source it names']);
    });

    it("keeps an inherited rejection whose phrase elides an inline code span, as a candidate's sentence does", async () => {
      const file = 'docs/reasons.md';
      const phrase = 'the «codespan» reasons it lists';
      await writeFile(path.join(scratch, file), 'Each check reports the `unavailable` reasons it lists.\n', 'utf8');
      await writeRecord(scratch, recordFor(phrase, '1', file));

      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      expect(await readRecordedPhrases(scratch)).toStrictEqual([phrase]);
    });

    it('keeps an inherited rejection whose phrase contains an inline code span as the source writes it', async () => {
      const file = 'docs/reasons.md';
      const phrase = 'the `unavailable` reasons it lists';
      await writeFile(path.join(scratch, file), `Each check reports ${phrase}.\n`, 'utf8');
      await writeRecord(scratch, recordFor(phrase, '1', file));

      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      expect(await readRecordedPhrases(scratch)).toStrictEqual([phrase]);
    });

    it('closes the loop: Recording a run suppresses its candidate on the next sweep', async () => {
      expect(expectSuccess(await sweep(scratch, bothRules())).summary.byRule['reduced-object-relative']).toBe(1);

      await recordFold(scratch, JSON.stringify(await fold(scratch)));

      expect(expectSuccess(await sweep(scratch, bothRules())).summary.byRule['reduced-object-relative']).toBe(0);
    });

    it("records whether each rule's detector ran, and a rejection under a rule without a detector", async () => {
      const undetected = await foldNamingUndetected(scratch);

      await recordFold(scratch, JSON.stringify(undetected));

      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
      expect(written.rules['em-dash']?.detected).toBe(true);
      expect(written.rules['sentence-case']?.detected).toBe(false);
      expect(written.rejections.map((rejection) => rejection.rule)).toContain('sentence-case');
    });

    it('closes the loop for a run naming a rule without a detector: The next sweep skips what it covered', async () => {
      const argv = [...bothRules(), '--rule', 'sentence-case@1=writing'];

      await recordFold(scratch, JSON.stringify(await foldNamingUndetected(scratch)));

      const { summary } = expectSuccess(await sweep(scratch, argv));
      expect(summary.batchesSkipped).toBe(summary.batchesPlanned);
      expect(summary.batchesPlanned).toBeGreaterThan(0);
    });
  });

  describe('file coverage', () => {
    it('reports a file whose prose changed after its sweep, though the sweep was dated the same day', async () => {
      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));
      expect(expectSuccess(await sweep(scratch, bothRules())).batches).toStrictEqual([]);

      await writeFile(path.join(scratch, 'docs/guide.md'), `${OBJECT_RELATIVE}\nA sentence added later.\n`, 'utf8');
      // A budget below either file's size gives each file a batch of its own, so that coverage is observed per file.
      const { batches } = expectSuccess(await sweep(scratch, [...bothRules(), '--batch-budget', '1']));

      expect(batches.map((batch) => batch.files)).toStrictEqual([['docs/guide.md']]);
      expect(batches[0]?.unswept).toStrictEqual(BOTH_RULES);
    });

    it('keeps a file covered after an edit outside its prose', async () => {
      await writeFile(path.join(scratch, 'src/tool.ts'), '// Reads the cache.\nexport const size = 1;\n', 'utf8');
      await recordFold(scratch, JSON.stringify(await foldRejectingNothing(scratch)));

      await writeFile(path.join(scratch, 'src/tool.ts'), '// Reads the cache.\nexport const size = 2;\n', 'utf8');
      const { batches, summary } = expectSuccess(await sweep(scratch, bothRules()));

      expect(summary.filesScanned).toBe(3);
      expect(batches).toStrictEqual([]);
    });

    it('keeps the coverage of a record without a file table, which the next record seeds for rules that the run did not sweep', async () => {
      const record = recordFor(await rejectedPhrase(scratch));
      record.rules['sentence-case'] = { version: '1', 'swept-at': '2026-09-02', detected: false, roots: ['.'] };
      await writeRecord(scratch, record);
      expect(
        expectSuccess(await sweep(scratch, [...bothRules(), '--rule', 'sentence-case@1=writing'])).batches,
      ).toStrictEqual([]);

      await recordFold(scratch, JSON.stringify({ ...(await foldRejectingNothing(scratch)), roots: ['docs'] }));

      const written = parseRecord(await readFile(path.join(scratch, RECORD_PATH), 'utf8'), NO_VERSIONS);
      const allRules = [...BOTH_RULES, 'sentence-case'];
      expect(written.files?.['docs/guide.md']?.rules).toStrictEqual(allRules);
      expect(written.files?.['src/notes.md']?.rules).toStrictEqual(allRules);
    });

    it('writes a record that the helper deployed before files were hashed still parses', async () => {
      await recordFold(scratch, JSON.stringify(await fold(scratch)));

      const content = await readFile(path.join(scratch, RECORD_PATH), 'utf8');
      expect(content).toMatch(/^files:/m);
      expect(PRIOR_RECORD_SCHEMA.safeParse(parseYaml(content)).success).toBe(true);
    });

    it('reports a record outside a git working tree as a structured failure and writes nothing', async () => {
      const result = await runRecord(
        { foldJson: JSON.stringify(await fold(scratch)), root: scratch, home: scratch },
        makeFakeGit({ notARepository: true }),
      );

      expect(result).toMatchObject({ ok: false, error: 'not-a-repository' });
      await expect(readFile(path.join(scratch, RECORD_PATH), 'utf8')).rejects.toThrow();
    });
  });
});

// region | Helpers

/** The fold from `fold`, naming `sentence-case` beside the detector rules and rejecting one site under it. */
async function foldNamingUndetected(root: string): Promise<RunFold> {
  const base = await fold(root);
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

/** Reads back the phrases of the rejections in the written record. */
async function readRecordedPhrases(root: string): Promise<string[]> {
  const written = parseRecord(await readFile(path.join(root, RECORD_PATH), 'utf8'), NO_VERSIONS);
  return written.rejections.map((rejection) => rejection.phrase);
}

// endregion | Helpers

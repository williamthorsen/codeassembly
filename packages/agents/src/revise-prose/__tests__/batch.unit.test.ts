import { describe, expect, it } from 'vitest';

import { DEFAULT_BATCH_BUDGET, planBatches } from '../batch.ts';
import type { Candidate, ScannedFile } from '../types.ts';

describe(planBatches, () => {
  it('packs whole directories up to the budget', () => {
    const batches = plan(
      [file('docs/a.md', 40), file('docs/b.md', 40), file('src/c.ts', 40), file('src/d.ts', 40)],
      [],
      100,
    );

    expect(batches.map((batch) => batch.files)).toStrictEqual([
      ['docs/a.md', 'docs/b.md'],
      ['src/c.ts', 'src/d.ts'],
    ]);
  });

  it('cuts on a directory boundary rather than filling the budget across one', () => {
    const batches = plan([file('docs/a.md', 40), file('src/b.ts', 40), file('src/c.ts', 40)], [], 100);

    expect(batches.map((batch) => batch.files)).toStrictEqual([['docs/a.md'], ['src/b.ts', 'src/c.ts']]);
  });

  it('splits a directory that exceeds the budget on its own', () => {
    const batches = plan([file('src/a.ts', 60), file('src/b.ts', 60), file('src/c.ts', 60)], [], 100);

    expect(batches.map((batch) => batch.files)).toStrictEqual([['src/a.ts'], ['src/b.ts'], ['src/c.ts']]);
  });

  it('gives a file larger than the budget a batch of its own rather than failing', () => {
    const batches = plan([file('docs/huge.md', 500)], [], 100);

    expect(batches).toStrictEqual([{ index: 0, files: ['docs/huge.md'], bytes: 500, recurring: false }]);
  });

  it('puts every copy of a sentence recurring across three files in batch 0', () => {
    const sentence = 'The helper reports the source that it names.';
    const batches = plan(
      [file('docs/a.md', 40), file('docs/b.md', 40), file('docs/c.md', 40), file('docs/d.md', 40)],
      [candidate('docs/a.md', sentence), candidate('docs/c.md', sentence), candidate('docs/d.md', sentence)],
      100,
    );

    expect(batches[0]).toMatchObject({ index: 0, files: ['docs/a.md', 'docs/c.md', 'docs/d.md'], recurring: true });
    expect(batches[1]?.files).toStrictEqual(['docs/b.md']);
  });

  it('lets one component exceed the budget, splitting it being what the grouping exists to prevent', () => {
    const sentence = 'A sentence that recurs.';
    const batches = plan(
      [file('docs/a.md', 80), file('docs/b.md', 80)],
      [candidate('docs/a.md', sentence), candidate('docs/b.md', sentence)],
      100,
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ files: ['docs/a.md', 'docs/b.md'], bytes: 160, recurring: true });
  });

  it('packs separate components into batches under the budget rather than into one batch', () => {
    const batches = plan(
      [file('docs/a.md', 60), file('docs/b.md', 60), file('docs/c.md', 60), file('docs/d.md', 60)],
      [
        candidate('docs/a.md', 'First shared.'),
        candidate('docs/b.md', 'First shared.'),
        candidate('docs/c.md', 'Second shared.'),
        candidate('docs/d.md', 'Second shared.'),
      ],
      150,
    );

    expect(batches.map((batch) => batch.files)).toStrictEqual([
      ['docs/a.md', 'docs/b.md'],
      ['docs/c.md', 'docs/d.md'],
    ]);
    expect(batches.every((batch) => batch.recurring)).toBe(true);
  });

  it('keeps files transitively linked by different sentences in one batch', () => {
    const batches = plan(
      [file('docs/a.md', 30), file('docs/b.md', 30), file('docs/c.md', 30)],
      [
        candidate('docs/a.md', 'Links a to b.'),
        candidate('docs/b.md', 'Links a to b.'),
        candidate('docs/b.md', 'Links b to c.'),
        candidate('docs/c.md', 'Links b to c.'),
      ],
      100,
    );

    expect(batches[0]).toMatchObject({ files: ['docs/a.md', 'docs/b.md', 'docs/c.md'], recurring: true });
  });

  it('names a file in exactly one batch', () => {
    const batches = plan(
      [file('docs/a.md', 30), file('docs/b.md', 30), file('src/c.ts', 30)],
      [candidate('docs/a.md', 'Shared.'), candidate('src/c.ts', 'Shared.')],
      100,
    );
    const named = batches.flatMap((batch) => batch.files);

    expect(named).toHaveLength(new Set(named).size);
    expect(named.toSorted()).toStrictEqual(['docs/a.md', 'docs/b.md', 'src/c.ts']);
  });

  it('treats a sentence confined to one file as ordinary, however often it appears there', () => {
    const sentence = 'A sentence that repeats in place.';
    const batches = plan(
      [file('docs/a.md', 40)],
      [candidate('docs/a.md', sentence), candidate('docs/a.md', sentence)],
      100,
    );

    expect(batches[0]?.recurring).toBe(false);
  });

  it('plans the same batches on every run over one file set', () => {
    const files = [file('docs/a.md', 40), file('docs/b.md', 40), file('src/c.ts', 90), file('src/d.ts', 20)];
    const candidates = [candidate('docs/a.md', 'Shared.'), candidate('src/d.ts', 'Shared.')];

    expect(plan(files, candidates, 100)).toStrictEqual(plan(files, candidates, 100));
  });

  it('numbers batches consecutively from zero', () => {
    const batches = plan([file('a/x.md', 60), file('b/y.md', 60), file('c/z.md', 60)], [], 100);

    expect(batches.map((batch) => batch.index)).toStrictEqual([0, 1, 2]);
  });

  it('plans nothing for an empty file set', () => {
    expect(plan([], [], 100)).toStrictEqual([]);
  });

  it('defaults to a documented budget', () => {
    expect(DEFAULT_BATCH_BUDGET).toBe(98_304);
    expect(planBatches({ files: [file('docs/a.md', 40)], candidates: [] })[0]?.files).toStrictEqual(['docs/a.md']);
  });

  it('refuses a budget no batch could satisfy', () => {
    expect(() => plan([], [], 0)).toThrow(/positive integer/);
    expect(() => plan([], [], 1.5)).toThrow(/positive integer/);
  });
});

// region | Helpers

/** Builds a candidate carrying only the fields batch planning reads. */
function candidate(file: string, sentence: string): Candidate {
  return { rule: 'em-dash', file, line: 1, phrase: sentence, sentence };
}

/** Builds a scanned file of the given byte length. */
function file(name: string, bytes: number): ScannedFile {
  return { file: name, bytes };
}

/** Plans batches over a file set, naming the budget every assertion above depends on. */
function plan(files: readonly ScannedFile[], candidates: readonly Candidate[], budget: number) {
  return planBatches({ files, candidates, budget });
}

// endregion | Helpers

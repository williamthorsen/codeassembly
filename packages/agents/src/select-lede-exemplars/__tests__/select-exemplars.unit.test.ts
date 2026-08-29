import { describe, expect, it } from 'vitest';

import type { LedeQuality } from '../../lede-corpus/lede-quality.ts';
import { loadWorkTypes, type WorkType } from '../../lib/work-types.ts';
import { selectExemplars } from '../select-exemplars.ts';
import {
  agentLedeFor,
  type CorpusFixture,
  createCorpusFixture,
  type DecisionSpec,
} from '../test-utils/create-corpus-fixture.ts';
import type { ExemplarSelection } from '../types.ts';

// Ids sort as ULID stems do, so `E` is the newest record and `A` the oldest.
const CORPUS: readonly DecisionSpec[] = [
  { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z' },
  { id: 'B', type: 'fix', capturedAt: '2026-02-01T00:00:00Z' },
  { id: 'C', type: 'refactor', capturedAt: '2026-03-01T00:00:00Z' },
  { id: 'D', type: 'ci', capturedAt: '2026-04-01T00:00:00Z' },
  { id: 'E', type: 'feat', capturedAt: '2026-05-01T00:00:00Z' },
];

// The same five changes, each rated, so a floor has a full range to cut against.
const RATED_CORPUS: readonly DecisionSpec[] = [
  { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', quality: 'exemplary' },
  { id: 'B', type: 'fix', capturedAt: '2026-02-01T00:00:00Z', quality: 'strong' },
  { id: 'C', type: 'refactor', capturedAt: '2026-03-01T00:00:00Z', quality: 'good' },
  { id: 'D', type: 'ci', capturedAt: '2026-04-01T00:00:00Z', quality: 'adequate' },
  { id: 'E', type: 'feat', capturedAt: '2026-05-01T00:00:00Z', quality: 'poor' },
];

describe(selectExemplars, () => {
  it('draws on the requested type alone when it can fill the count', async () => {
    const selection = await select({ decisions: CORPUS, type: 'feat', count: 2 });

    expect(selection.widening).toBe('none');
    expect(selection.exemplars.map((exemplar) => exemplar.type)).toStrictEqual(['feat', 'feat']);
  });

  it('orders the exemplars newest first by the record captured-at', async () => {
    const selection = await select({ decisions: CORPUS, type: 'feat', count: 2 });

    expect(selection.exemplars.map((exemplar) => exemplar.capturedAt)).toStrictEqual([
      '2026-05-01T00:00:00Z',
      '2026-01-01T00:00:00Z',
    ]);
  });

  it('widens to the tier-mates of the requested type to make up a shortfall', async () => {
    const selection = await select({ decisions: CORPUS, type: 'feat', count: 3 });

    expect(selection.widening).toBe('tier');
    expect(selection.exemplars.map((exemplar) => exemplar.type)).toContain('fix');
  });

  it('widens to any type once the tier-mates run out', async () => {
    const selection = await select({ decisions: CORPUS, type: 'feat', count: 5 });

    expect(selection.widening).toBe('any');
    expect(selection.exemplars).toHaveLength(5);
  });

  it('widens straight to any type for a tier that carries nothing else', async () => {
    const decisions = [{ id: 'A', type: 'ci', capturedAt: '2026-01-01T00:00:00Z' }];

    const selection = await select({ decisions, type: 'feat', count: 2 });

    expect(selection.widening).toBe('any');
    expect(selection.exemplars.map((exemplar) => exemplar.type)).toStrictEqual(['ci']);
  });

  it('keeps an older exact match over a newer tier-mate', async () => {
    const decisions: DecisionSpec[] = [
      { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z' },
      { id: 'Z', type: 'fix', capturedAt: '2026-09-01T00:00:00Z' },
    ];

    const selection = await select({ decisions, type: 'feat', count: 1 });

    expect(selection.widening).toBe('none');
    expect(selection.exemplars.map((exemplar) => exemplar.lede)).toStrictEqual([agentLedeFor('A')]);
  });

  it('buckets a record of a retired type by the tier the record carries', async () => {
    const decisions: DecisionSpec[] = [
      { id: 'A', type: 'retired', capturedAt: '2026-01-01T00:00:00Z', tier: 'public' },
      { id: 'B', type: 'docs', capturedAt: '2026-09-01T00:00:00Z' },
    ];

    const selection = await select({ decisions, type: 'feat', count: 1 });

    expect(selection.widening).toBe('tier');
    expect(selection.exemplars.map((exemplar) => exemplar.type)).toStrictEqual(['retired']);
  });

  it('admits a rating at the floor and everything above it', async () => {
    const selection = await select({ decisions: RATED_CORPUS, type: 'feat', count: 5, minQuality: 'strong' });

    expect(selection.exemplars.map((exemplar) => exemplar.lede)).toStrictEqual([agentLedeFor('B'), agentLedeFor('A')]);
  });

  it('excludes a record rated below the floor', async () => {
    const selection = await select({ decisions: RATED_CORPUS, type: 'feat', count: 5, minQuality: 'exemplary' });

    expect(selection.exemplars.map((exemplar) => exemplar.lede)).toStrictEqual([agentLedeFor('A')]);
  });

  it('excludes an unrated record whenever a floor is named', async () => {
    const selection = await select({ decisions: CORPUS, type: 'feat', count: 5, minQuality: 'poor' });

    expect(selection.exemplars).toStrictEqual([]);
  });

  it('reads every record, rated or not, when no floor is named', async () => {
    const mixed: readonly DecisionSpec[] = [
      { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z' },
      { id: 'B', type: 'feat', capturedAt: '2026-02-01T00:00:00Z', quality: 'good' },
    ];
    const selection = await select({ decisions: mixed, type: 'feat', count: 5 });

    expect(selection.exemplars).toHaveLength(2);
  });

  it('widens past a type the floor left short', async () => {
    const decisions = [
      { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', quality: 'poor' },
      { id: 'B', type: 'fix', capturedAt: '2026-02-01T00:00:00Z', quality: 'exemplary' },
    ];
    const selection = await select({ decisions, type: 'feat', count: 1, minQuality: 'strong' });

    expect(selection.widening).toBe('tier');
    expect(selection.exemplars.map((exemplar) => exemplar.lede)).toStrictEqual([agentLedeFor('B')]);
  });

  it('reports a rating the scale does not declare and keeps the record selectable without a floor', async () => {
    const decisions = [{ id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', quality: 'excellent' }];
    const selection = await select({ decisions, type: 'feat', count: 5 });

    expect(selection.warnings[0]).toContain('A.md: carries quality "excellent"');
    expect(selection.exemplars).toHaveLength(1);
  });

  it('returns an empty list for a corpus holding no decisions', async () => {
    const selection = await select({ decisions: [], type: 'feat', count: 5 });

    expect(selection).toStrictEqual({ exemplars: [], widening: 'none', warnings: [] });
  });

  it('returns an empty list for a store with no events directory', async () => {
    const fixture = await createCorpusFixture();
    const workTypes = await loadTaxonomy(fixture);

    const selection = await selectExemplars({
      storePath: '/no/such/store',
      workTypes,
      requested: requireType(workTypes, 'feat'),
      count: 5,
    });

    expect(selection.exemplars).toStrictEqual([]);
  });

  it('reads the merged lede when a record carries one', async () => {
    const decisions = [
      { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', mergedLede: 'The lede that merged.' },
    ];

    const selection = await select({ decisions, type: 'feat', count: 1 });

    expect(selection.exemplars.map((exemplar) => exemplar.lede)).toStrictEqual(['The lede that merged.']);
  });

  it('matches a record filed under an alias to the canonical type it was requested by', async () => {
    const decisions = [{ id: 'A', type: 'feature', capturedAt: '2026-01-01T00:00:00Z' }];

    const selection = await select({ decisions, type: 'feat', count: 1 });

    expect(selection.widening).toBe('none');
    expect(selection.exemplars.map((exemplar) => exemplar.type)).toStrictEqual(['feat']);
  });

  it('carries the change identity of each exemplar', async () => {
    const decisions = [{ id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', scope: 'kb', pr: '1124' }];

    const selection = await select({ decisions, type: 'feat', count: 1 });

    expect(selection.exemplars[0]).toStrictEqual({
      lede: agentLedeFor('A'),
      type: 'feat',
      tier: 'public',
      scope: 'kb',
      pr: '1124',
      capturedAt: '2026-01-01T00:00:00Z',
    });
  });

  it('passes over an event that is not a lede decision without reporting it', async () => {
    const files = {
      'Z.md':
        '---\nrecordType: event\nid: Z\ncaptured-at: 2026-09-01T00:00:00Z\ncwd: /repo\nsummary: Other\n---\n\nBody.\n',
    };

    const selection = await select({ decisions: CORPUS, files, type: 'feat', count: 2 });

    expect(selection.warnings).toStrictEqual([]);
  });

  it.each([
    ['a broken YAML block', '---\ntags: [lede-decision\ncwd: /repo\n---\n\n## Agent lede\n\nText.\n'],
    ['no frontmatter block at all', '## Agent lede\n\nText.\n'],
  ])('reports a record with %s, which carries no tag to place it by', async (_label, content) => {
    const selection = await select({ decisions: CORPUS, files: { 'Z.md': content }, type: 'feat', count: 2 });

    expect(selection.warnings).toHaveLength(1);
    expect(selection.warnings[0]).toContain('Z.md: frontmatter does not parse');
  });

  it('reports a decision whose frontmatter will not parse as an event rather than failing the run', async () => {
    const files = { 'Z.md': '---\nrecordType: event\ntags: [lede-decision]\n---\n\n## Agent lede\n\nText.\n' };

    const selection = await select({ decisions: CORPUS, files, type: 'feat', count: 2 });

    expect(selection.warnings).toHaveLength(1);
    expect(selection.warnings[0]).toContain('Z.md: does not parse as an event record');
    expect(selection.exemplars).toHaveLength(2);
  });

  it('reports a decision carrying neither lede heading', async () => {
    const files = {
      'Z.md':
        "---\nrecordType: event\nid: Z\ncaptured-at: 2026-09-01T00:00:00Z\ncwd: /repo\nsummary: S\ntags: [lede-decision]\ntype: feat\ntier: public\nscope: agents\npr: '1'\n---\n\n## Comment\n\nCut it.\n",
    };

    const selection = await select({ decisions: CORPUS, files, type: 'feat', count: 2 });

    expect(selection.warnings[0]).toContain('Z.md: carries neither a merged nor an agent lede');
  });

  it('reports a decision that does not name the change it describes', async () => {
    const files = {
      'Z.md':
        '---\nrecordType: event\nid: Z\ncaptured-at: 2026-09-01T00:00:00Z\ncwd: /repo\nsummary: S\ntags: [lede-decision]\ntier: public\n---\n\n## Agent lede\n\nText.\n',
    };

    const selection = await select({ decisions: CORPUS, files, type: 'feat', count: 2 });

    expect(selection.warnings[0]).toContain('Z.md: does not name the change it describes');
  });
});

// region | Helpers

/** Loads the fixture taxonomy, failing the test when it does not load. */
async function loadTaxonomy(fixture: CorpusFixture): Promise<ReadonlyMap<string, WorkType>> {
  const workTypes = await loadWorkTypes(fixture.dataDir);
  if (workTypes === null) {
    throw new Error('expected the fixture taxonomy to load');
  }
  return workTypes;
}

/** Reads a work type out of the taxonomy, failing the test when it declares none by that name. */
function requireType(workTypes: ReadonlyMap<string, WorkType>, type: string): WorkType {
  const resolved = workTypes.get(type);
  if (resolved === undefined) {
    throw new Error(`the fixture taxonomy declares no work type "${type}"`);
  }
  return resolved;
}

/** Runs a selection over a fresh fixture corpus. */
async function select(input: {
  decisions: readonly DecisionSpec[];
  files?: Readonly<Record<string, string>>;
  type: string;
  count: number;
  minQuality?: LedeQuality;
}): Promise<ExemplarSelection> {
  const fixture = await createCorpusFixture({
    decisions: input.decisions,
    ...(input.files !== undefined && { files: input.files }),
  });
  const workTypes = await loadTaxonomy(fixture);

  return selectExemplars({
    storePath: fixture.storePath,
    workTypes,
    requested: requireType(workTypes, input.type),
    count: input.count,
    ...(input.minQuality !== undefined && { minQuality: input.minQuality }),
  });
}

// endregion | Helpers

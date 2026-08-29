import { describe, expect, it } from 'vitest';

import { parseArgs, runSelect } from '../cli.ts';
import {
  agentLedeFor,
  type CorpusFixture,
  createCorpusFixture,
  type DecisionSpec,
} from '../test-utils/create-corpus-fixture.ts';
import type { SelectResult, SelectSuccess } from '../types.ts';

const STORE_NAME = 'codeassembly';
// A registry name the helper does not serve, so an assertion on it cannot be satisfied by the bound default.
const OTHER_STORE_NAME = 'some-other-corpus';

const CORPUS: readonly DecisionSpec[] = [
  { id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z' },
  { id: 'B', type: 'fix', capturedAt: '2026-02-01T00:00:00Z' },
  { id: 'C', type: 'ci', capturedAt: '2026-03-01T00:00:00Z' },
];

describe(parseArgs, () => {
  it('parses every value-bearing flag in long form', () => {
    const parsed = parseArgs([
      '--type',
      'feat',
      '--count',
      '3',
      '--min-quality',
      'strong',
      '--store',
      OTHER_STORE_NAME,
      '--data-dir',
      '/_data',
    ]);

    expect(parsed).toStrictEqual({
      type: 'feat',
      count: 3,
      minQuality: 'strong',
      store: OTHER_STORE_NAME,
      dataDir: '/_data',
    });
  });

  it('reads every record when --min-quality names no floor', () => {
    expect(parseArgs(['--type', 'feat']).minQuality).toBeNull();
  });

  it('refuses a --min-quality outside the declared scale', () => {
    expect(() => parseArgs(['--type', 'feat', '--min-quality', 'excellent'])).toThrow('--min-quality must be one of');
  });

  it('returns five exemplars when --count names no number', () => {
    expect(parseArgs(['--type', 'feat']).count).toBe(5);
  });

  it('reads the corpus this helper serves when --store names none', () => {
    expect(parseArgs(['--type', 'feat']).store).toBe(STORE_NAME);
  });

  it('requires --type, since exemplars are calibrated to a work type', () => {
    expect(() => parseArgs([])).toThrow('--type is required');
  });

  it.each([['0'], ['-1'], ['two'], ['1.5']])('refuses a --count of %s', (count) => {
    expect(() => parseArgs(['--type', 'feat', '--count', count])).toThrow('--count must be a whole number');
  });

  it('refuses the @default sentinel, which names a machine setting rather than a corpus', () => {
    expect(() => parseArgs(['--type', 'feat', '--store', '@default'])).toThrow('--store @default is not accepted');
  });

  it('refuses an unexpected positional argument', () => {
    expect(() => parseArgs(['feat'])).toThrow('unexpected argument: feat');
  });
});

describe(runSelect, () => {
  it('returns the requested type resolved to its canonical key and tier', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await run({ argv: ['--type', 'feature', '--count', '1'], fixture });

    expect(expectSuccess(result)).toMatchObject({ type: 'feat', tier: 'public', store: STORE_NAME });
  });

  it('returns the exemplars and the widening that reached them', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await run({ argv: ['--type', 'feat', '--count', '2'], fixture });

    const success = expectSuccess(result);
    expect(success.widening).toBe('tier');
    expect(success.exemplars.map((exemplar) => exemplar.lede)).toContain(agentLedeFor('A'));
  });

  it('reads the corpus a --store name points at', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS, storeName: OTHER_STORE_NAME });

    const result = await run({ argv: ['--type', 'feat', '--store', OTHER_STORE_NAME], fixture });

    expect(expectSuccess(result).store).toBe(OTHER_STORE_NAME);
  });

  it('reports an exhausted corpus as a success carrying a diagnostic', async () => {
    const fixture = await createCorpusFixture({ decisions: [] });

    const result = await run({ argv: ['--type', 'feat'], fixture });

    const success = expectSuccess(result);
    expect(success.exemplars).toStrictEqual([]);
    expect(success.diagnostic).toContain('no lede decisions were found');
  });

  it('reports the floor a request applied, so an empty draw names its cause', async () => {
    const decisions = [{ id: 'A', type: 'feat', capturedAt: '2026-01-01T00:00:00Z', quality: 'adequate' }];
    const fixture = await createCorpusFixture({ decisions });

    const result = await run({ argv: ['--type', 'feat', '--min-quality', 'strong'], fixture });

    const success = expectSuccess(result);
    expect(success.minQuality).toBe('strong');
    expect(success.exemplars).toStrictEqual([]);
    expect(success.diagnostic).toContain('rated strong or better');
  });

  it('reports no floor when the request named none', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await run({ argv: ['--type', 'feat'], fixture });

    expect(expectSuccess(result).minQuality).toBe('none');
  });

  it('carries the reason a decision record could not be read', async () => {
    const files = { 'Z.md': '---\nrecordType: event\ntags: [lede-decision]\n---\n\n## Agent lede\n\nText.\n' };
    const fixture = await createCorpusFixture({ decisions: CORPUS, files });

    const result = await run({ argv: ['--type', 'feat', '--count', '1'], fixture });

    expect(expectSuccess(result).warnings).toHaveLength(1);
  });

  it('reports a work type the taxonomy does not declare', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await run({ argv: ['--type', 'invented'], fixture });

    expect(expectFailure(result)).toBe('unknown-type');
  });

  it('reports a corpus registered under no name', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS, storeName: OTHER_STORE_NAME });

    const result = await run({ argv: ['--type', 'feat'], fixture });

    expect(expectFailure(result)).toBe('store-not-registered');
  });

  it('reports a data directory carrying no taxonomy', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await runSelect({
      argv: ['--type', 'feat', '--data-dir', fixture.storePath],
      defaultDataDir: fixture.dataDir,
      home: fixture.home,
    });

    expect(expectFailure(result)).toBe('no-taxonomy');
  });

  it('reports an invalid invocation without reading the corpus', async () => {
    const fixture = await createCorpusFixture({ decisions: CORPUS });

    const result = await run({ argv: ['--count', '2'], fixture });

    expect(expectFailure(result)).toBe('invalid-args');
  });
});

// region | Helpers

/** Narrows a result to its failure arm and yields the error code, failing the test when it succeeded. */
function expectFailure(result: SelectResult): string {
  if (result.ok) {
    throw new Error(`expected a failure, got ${JSON.stringify(result)}`);
  }
  return result.error;
}

/** Narrows a result to its success arm, failing the test with the reported reason when it is not one. */
function expectSuccess(result: SelectResult): SelectSuccess {
  if (!result.ok) {
    throw new Error(`expected a selection, got ${JSON.stringify(result)}`);
  }
  return result;
}

/** Runs the helper against a fixture corpus, defaulting the taxonomy and registry to the fixture's own. */
async function run(input: { argv: readonly string[]; fixture: CorpusFixture }): Promise<SelectResult> {
  return runSelect({ argv: input.argv, defaultDataDir: input.fixture.dataDir, home: input.fixture.home });
}

// endregion | Helpers

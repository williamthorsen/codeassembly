import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runRetrieveEvents } from '../cli.ts';

// The vault and registry fixtures live with the shared search primitive (kb-search), which owns scope and recall.
const FIXTURES = join(import.meta.dirname, '..', '..', 'kb-search', '__tests__', 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');

describe(parseArgs, () => {
  it('joins non-flag tokens into the query', () => {
    expect(parseArgs(['flaky', 'retry']).query).toBe('flaky retry');
  });

  it('parses a --tag filter given with an inline value', () => {
    expect(parseArgs(['flaky', '--tag=observation']).filters.tag).toBe('observation');
  });

  it('parses --store as the store-scope name and --kb as its alias', () => {
    expect(parseArgs(['q', '--store', 'codeassembly']).storeName).toBe('codeassembly');
    expect(parseArgs(['q', '--kb=codeassembly']).storeName).toBe('codeassembly');
  });

  it('recognizes the --all-kbs flag', () => {
    expect(parseArgs(['q', '--all-kbs']).allKbs).toBe(true);
  });

  it('rejects the assertion-only --diataxis flag as unknown', () => {
    expect(() => parseArgs(['q', '--diataxis', 'howto'])).toThrow(/unknown flag/);
  });

  it('rejects the assertion-only --folder flag as unknown', () => {
    expect(() => parseArgs(['q', '--folder', 'sub'])).toThrow(/unknown flag/);
  });

  it('throws when --tag has no value', () => {
    expect(() => parseArgs(['q', '--tag'])).toThrow(/--tag requires a value/);
  });
});

describe(runRetrieveEvents, () => {
  it('returns an event candidate carrying its recurrence signals', async () => {
    const result = await runRetrieveEvents({ argv: ['phantomwidget'], startDir: NOTES_VAULT, home: FIXTURES });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      summary: 'Noticed a phantomwidget glitch in the content events log',
      capturedAt: '2026-04-20T09:00:00.000Z',
      repo: 'owner/repo-content',
      occurrences: 1,
    });
  });

  it('excludes assertion records, pointing the reader at assertion recall', async () => {
    const result = await runRetrieveEvents({ argv: ['backpressure'], startDir: NOTES_VAULT, home: FIXTURES });

    // backpressure matches only an assertion, so the event table is empty and the diagnostic routes to assertion recall.
    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toMatch(/kb-retrieve/);
  });

  it('reports a no-match diagnostic when nothing matches', async () => {
    const result = await runRetrieveEvents({ argv: ['zzzznomatch'], startDir: NOTES_VAULT, home: FIXTURES });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('reports an unregistered-store diagnostic when --store names no registry entry', async () => {
    const result = await runRetrieveEvents({
      argv: ['phantomwidget', '--store', 'no-such-store'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
    });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.diagnostic).toMatch(/not registered/);
  });

  it('reports a diagnostic when the query is blank', async () => {
    const result = await runRetrieveEvents({ argv: [], startDir: NOTES_VAULT, home: FIXTURES });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no query provided');
  });
});

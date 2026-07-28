import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildRecallStub } from '../../kb-search/test-utils/build-recall-stub.ts';
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

  it('parses --min-impact as the level floor, in both spaced and inline forms', () => {
    expect(parseArgs(['q', '--min-impact', 'high']).minImpact).toBe('high');
    expect(parseArgs(['q', '--min-impact=critical']).minImpact).toBe('critical');
  });

  it('leaves minImpact null when --min-impact is absent', () => {
    expect(parseArgs(['q']).minImpact).toBeNull();
  });

  it('throws when --min-impact has no value', () => {
    expect(() => parseArgs(['q', '--min-impact'])).toThrow(/--min-impact requires a value/);
  });

  it('throws when --min-impact is outside the declared levels', () => {
    expect(() => parseArgs(['q', '--min-impact', 'louder'])).toThrow(/--min-impact must be one of/);
  });
});

describe(runRetrieveEvents, () => {
  it('returns an event candidate carrying its recurrence signals', async () => {
    const result = await runRetrieveEvents({
      argv: ['phantomwidget'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [eventNote('01HZCEVENTAAAAAAAAAAAAAAAA.md')] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      summary: 'Noticed a phantomwidget glitch in the content events log',
      capturedAt: '2026-04-20T09:00:00.000Z',
      repo: 'owner/repo-content',
      occurrences: 1,
    });
  });

  it('excludes assertion records, pointing the reader at assertion recall', async () => {
    const result = await runRetrieveEvents({
      argv: ['backpressure'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'streams.md')] }),
    });

    // The only recalled note is an assertion, so the event table is empty and the diagnostic routes to assertion recall.
    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toMatch(/kb-retrieve/);
  });

  it('reports a no-match diagnostic when nothing matches', async () => {
    const result = await runRetrieveEvents({
      argv: ['zzzznomatch'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub(),
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('reports an unregistered-store diagnostic when --store names no registry entry', async () => {
    const result = await runRetrieveEvents({
      argv: ['phantomwidget', '--store', 'no-such-store'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub(),
    });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.diagnostic).toMatch(/not registered/);
  });

  it('reports a diagnostic when the query is blank', async () => {
    const result = await runRetrieveEvents({
      argv: [],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub(),
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no query provided');
  });

  it('surfaces a declared impact on a candidate and omits it on an unrated one', async () => {
    const result = await runRetrieveEvents({
      argv: ['snorkleweft'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: snorkleweftEvents() }),
    });

    const byImpact = new Map(result.candidates.map((candidate) => [candidate.summary, candidate.impact]));
    expect(byImpact.get('A snorkleweft outage rated high')).toBe('high');
    expect(byImpact.get('A snorkleweft observation left unrated')).toBeUndefined();
  });

  it('keeps only events rated at or above --min-impact, excluding lower and unrated events', async () => {
    const result = await runRetrieveEvents({
      argv: ['snorkleweft', '--min-impact', 'high'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: snorkleweftEvents() }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ summary: 'A snorkleweft outage rated high', impact: 'high' });
  });

  it('reports a threshold diagnostic when --min-impact filters every match out', async () => {
    const result = await runRetrieveEvents({
      argv: ['snorkleweft', '--min-impact', 'critical'],
      startDir: NOTES_VAULT,
      home: FIXTURES,
      recall: buildRecallStub({ hits: snorkleweftEvents() }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('all matches were below the --min-impact threshold of critical');
  });
});

/** Resolves an event record's filename to its absolute path in the shared fixture vault. */
function eventNote(name: string): string {
  return join(NOTES_VAULT, 'content', 'events', name);
}

/** The fixture events mentioning `snorkleweft`: one rated high, one rated lower, one left unrated. */
function snorkleweftEvents(): string[] {
  return [
    eventNote('01HZCEVENTHGHAAAAAAAAAAAAA.md'),
    eventNote('01HZCEVENTMNRAAAAAAAAAAAAA.md'),
    eventNote('01HZCEVENTNRTAAAAAAAAAAAAA.md'),
  ];
}

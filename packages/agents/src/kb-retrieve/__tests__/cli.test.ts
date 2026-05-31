import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runRetrieve } from '../cli.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
const MALFORMED_NO_KB = join(FIXTURES, 'malformed-no-kb');
const MALFORMED_REGISTRY = join(FIXTURES, 'malformed-registry');
const DEAD_PATH_REGISTRY = join(FIXTURES, 'dead-path-registry');
const MIXED_REGISTRY = join(FIXTURES, 'mixed-registry');
const NOW = new Date('2026-05-01T00:00:00Z');

describe(parseArgs, () => {
  it('joins non-flag tokens into the query', () => {
    expect(parseArgs(['node', 'streams']).query).toBe('node streams');
  });

  it('recognizes the --all-kbs flag', () => {
    expect(parseArgs(['query', '--all-kbs']).allKbs).toBe(true);
  });

  it('parses a --type filter given as a separate value', () => {
    expect(parseArgs(['query', '--type', 'howto']).filters.type).toBe('howto');
  });

  it('parses a --tag filter given with an inline value', () => {
    expect(parseArgs(['query', '--tag=streams']).filters.tag).toBe('streams');
  });

  it('parses --folder alongside the query', () => {
    const parsed = parseArgs(['react', 'hooks', '--folder', 'sub']);

    expect(parsed.query).toBe('react hooks');
    expect(parsed.filters.folder).toBe('sub');
  });

  it('throws when a value-bearing flag has no value', () => {
    expect(() => parseArgs(['query', '--type'])).toThrow(/--type requires a value/);
  });

  it('throws when a value-bearing flag has an empty inline value', () => {
    expect(() => parseArgs(['query', '--type='])).toThrow(/--type requires a value/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['query', '--bogus'])).toThrow(/unknown flag/);
  });

  it('returns an empty query for empty argv', () => {
    expect(parseArgs([]).query).toBe('');
  });

  it('leaves allKbs false for empty argv', () => {
    expect(parseArgs([]).allKbs).toBe(false);
  });
});

describe(runRetrieve, () => {
  it('returns a candidate table for a matching query', async () => {
    const result = await runRetrieve({
      argv: ['backpressure'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.map((candidate) => candidate.title)).toContain('Working with Node.js streams');
    expect(result.diagnostic).toBeUndefined();
  });

  it('applies the --type filter to the candidate table', async () => {
    const result = await runRetrieve({
      argv: ['deployment', '--type', 'howto'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.every((candidate) => candidate.type === 'howto')).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('reports a diagnostic and no candidates when nothing matches', async () => {
    const result = await runRetrieve({
      argv: ['zzzznomatch'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('distinguishes filtered-out matches from a no-hit query in the diagnostic', async () => {
    const result = await runRetrieve({
      argv: ['backpressure', '--folder', 'zzz-nonexistent'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.diagnostic).toBe('all matches were filtered out');
  });

  it('reports a diagnostic when no knowledge base is configured or discovered', async () => {
    const result = await runRetrieve({ argv: ['anything'], startDir: '/', now: NOW, home: FIXTURES });

    expect(result.scopedKbs).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.diagnostic).toBe('no knowledge base configured or discovered');
  });

  it('reports a diagnostic when the query is blank', async () => {
    const result = await runRetrieve({ argv: ['--all-kbs'], startDir: NOTES_VAULT, now: NOW });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no query provided');
  });

  it('names the registry defect in warnings and diagnostic when a malformed registry is the only KB', async () => {
    const result = await runRetrieve({ argv: ['anything'], startDir: MALFORMED_NO_KB, now: NOW, home: FIXTURES });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^registry invalid: /);
    expect(result.diagnostic).toMatch(/^registry invalid: /);
  });

  it('returns candidates while still warning about a malformed registry alongside a discovered KB', async () => {
    const result = await runRetrieve({ argv: ['zarquon'], startDir: MALFORMED_REGISTRY, now: NOW, home: FIXTURES });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^registry invalid: /);
    expect(result.diagnostic).toBeUndefined();
  });

  it('warns about a dead-path entry that is the only KB and excludes it from scopedKbs', async () => {
    const result = await runRetrieve({ argv: ['anything'], startDir: DEAD_PATH_REGISTRY, now: NOW, home: FIXTURES });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.warnings).toEqual([
      `registry KB "ghost-vault" path does not exist: ${join(DEAD_PATH_REGISTRY, '.agents', 'no-such-kb-directory')}`,
    ]);
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('returns candidates while warning about a dead-path entry alongside a live KB', async () => {
    const result = await runRetrieve({
      argv: ['backpressure', '--all-kbs'],
      startDir: MIXED_REGISTRY,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([
      `registry KB "ghost-vault" path does not exist: ${join(MIXED_REGISTRY, '.agents', 'no-such-kb-directory')}`,
    ]);
    expect(result.diagnostic).toBeUndefined();
  });

  it('keeps warnings empty when no registry is configured and a discovered KB is searched', async () => {
    const result = await runRetrieve({ argv: ['backpressure'], startDir: NOTES_VAULT, now: NOW, home: FIXTURES });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });
});

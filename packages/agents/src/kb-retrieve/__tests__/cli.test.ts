import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runRetrieve } from '../cli.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
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
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('reports a diagnostic when no knowledge base is configured or discovered', async () => {
    const result = await runRetrieve({ argv: ['anything'], startDir: '/', now: NOW, home: FIXTURES });

    expect(result.scopedKbs).toEqual([]);
    expect(result.diagnostic).toBe('no knowledge base configured or discovered');
  });

  it('reports a diagnostic when the query is blank', async () => {
    const result = await runRetrieve({ argv: ['--all-kbs'], startDir: NOTES_VAULT, now: NOW });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no query provided');
  });
});

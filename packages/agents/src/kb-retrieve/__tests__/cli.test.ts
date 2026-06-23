import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseArgs, runRetrieve } from '../cli.ts';

const FIXTURES = join(import.meta.dirname, 'fixtures');
const NOTES_VAULT = join(FIXTURES, 'notes-vault');
const MALFORMED_NO_KB = join(FIXTURES, 'malformed-no-kb');
const MALFORMED_REGISTRY = join(FIXTURES, 'malformed-registry');
const DEAD_PATH_REGISTRY = join(FIXTURES, 'dead-path-registry');
const MIXED_REGISTRY = join(FIXTURES, 'mixed-registry');
const CUSTOM_SCHEMA_VAULT = join(FIXTURES, 'custom-schema-vault');
const MALFORMED_SCHEMA_VAULT = join(FIXTURES, 'malformed-schema-vault');
const MULTI_SCHEMA_REGISTRY = join(FIXTURES, 'multi-schema-registry');
const SCOPED_VAULT = join(FIXTURES, 'scoped-vault');
const DEFAULT_SCOPE_VAULT = join(FIXTURES, 'default-scope-vault');
const MALFORMED_CONFIG_VAULT = join(FIXTURES, 'malformed-config-vault');
const NOW = new Date('2026-05-01T00:00:00Z');

describe(parseArgs, () => {
  it('joins non-flag tokens into the query', () => {
    expect(parseArgs(['node', 'streams']).query).toBe('node streams');
  });

  it('recognizes the --all-kbs flag', () => {
    expect(parseArgs(['query', '--all-kbs']).allKbs).toBe(true);
  });

  it('parses a --diataxis filter given as a separate value', () => {
    expect(parseArgs(['query', '--diataxis', 'howto']).filters.diataxis).toBe('howto');
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
    expect(() => parseArgs(['query', '--diataxis'])).toThrow(/--diataxis requires a value/);
  });

  it('throws when a value-bearing flag has an empty inline value', () => {
    expect(() => parseArgs(['query', '--diataxis='])).toThrow(/--diataxis requires a value/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['query', '--bogus'])).toThrow(/unknown flag/);
  });

  it('rejects the retired --type flag as unknown', () => {
    expect(() => parseArgs(['query', '--type', 'howto'])).toThrow(/unknown flag/);
  });

  it('parses --store as the store-scope name', () => {
    expect(parseArgs(['query', '--store', 'codeassembly']).storeName).toBe('codeassembly');
  });

  it('parses --kb as an alias for the store-scope name', () => {
    expect(parseArgs(['query', '--kb=codeassembly']).storeName).toBe('codeassembly');
  });

  it('leaves storeName null when no store flag is given', () => {
    expect(parseArgs(['query']).storeName).toBeNull();
  });

  it('throws when --store has no value', () => {
    expect(() => parseArgs(['query', '--store'])).toThrow(/--store requires a value/);
  });

  it('binds an inline =value verbatim even when it begins with --', () => {
    expect(parseArgs(['query', '--tag=--odd-tag']).filters.tag).toBe('--odd-tag');
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

  it('recalls an event stored under content/events/ and classifies it as an event', async () => {
    const result = await runRetrieve({
      argv: ['phantomwidget'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    const event = result.candidates.find((candidate) => candidate.path.includes(join('content', 'events')));
    expect(event).toBeDefined();
    expect(event?.capturedAt).toBe('2026-04-20T09:00:00.000Z');
  });

  it('applies the --diataxis filter to the candidate table', async () => {
    const result = await runRetrieve({
      argv: ['deployment', '--diataxis', 'howto'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.every((candidate) => candidate.diataxis === 'howto')).toBe(true);
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

  it('reports an unregistered-store diagnostic when --store names no registry entry', async () => {
    const result = await runRetrieve({
      argv: ['anything', '--store', 'no-such-store'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.scopedKbs).toEqual([]);
    expect(result.diagnostic).toBe('store "no-such-store" is not registered in kb.yaml');
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

  it('applies a discovered store schema, honoring a custom record type recall policy', async () => {
    const result = await runRetrieve({
      argv: ['phantomtimer'],
      startDir: CUSTOM_SCHEMA_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    const insight = result.candidates.find((candidate) => candidate.path.includes('insight-note.md'));
    // The store's schema declares `insight` with recall: recurrence-recency, so it surfaces recurrence signals.
    expect(insight?.capturedAt).toBe('2026-05-22T10:00:00.000Z');
    expect(insight?.repo).toBe('owner/repo-insight');
    expect(insight?.title).toBe('A recurring flaky-timer insight');
    expect(result.warnings).toEqual([]);
  });

  it('degrades a malformed store schema to the default and warns instead of failing the search', async () => {
    const result = await runRetrieve({
      argv: ['brokenschema'],
      startDir: MALFORMED_SCHEMA_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/schema invalid/);
    // Degraded to the default schema: the assertion note still ranks by freshness (2026-04-20 to 2026-05-01).
    expect(result.candidates[0]?.lastVerifiedAgeDays).toBe(11);
    expect(result.diagnostic).toBeUndefined();
  });

  it('applies a valid store schema while degrading a malformed sibling in one multi-store search', async () => {
    const result = await runRetrieve({
      argv: ['crossstore', '--all-kbs'],
      startDir: MULTI_SCHEMA_REGISTRY,
      now: NOW,
      home: FIXTURES,
    });

    const insight = result.candidates.find((candidate) => candidate.path.includes('insight-note.md'));
    const plain = result.candidates.find((candidate) => candidate.path.includes('plain-note.md'));
    // The valid custom schema still applies its recurrence-recency policy...
    expect(insight?.capturedAt).toBe('2026-05-22T10:00:00.000Z');
    // ...while the malformed sibling degrades, still surfaces its note, and contributes exactly one schema warning.
    expect(plain).toBeDefined();
    expect(result.warnings.filter((warning) => /schema invalid/.test(warning))).toHaveLength(1);
  });

  it('recalls only notes inside the configured targets, skipping root and excluded markdown', async () => {
    // scoped-vault stores `zephyrquux` in README.md (root), content/in-scope.md, and content/drafts/excluded.md;
    // its config targets `content/**/*.md` and excludes `content/drafts/**`, so only in-scope.md is a note.
    const result = await runRetrieve({ argv: ['zephyrquux'], startDir: SCOPED_VAULT, now: NOW, home: FIXTURES });

    expect(result.candidates.map((candidate) => candidate.path.split('/').at(-1))).toEqual(['in-scope.md']);
    expect(result.warnings).toEqual([]);
  });

  it('scopes to content/ under the default config when no config.yaml is present', async () => {
    // default-scope-vault has no `.kb/config.yaml`, so the default `content/**/*.md` applies: the root README is skipped.
    const result = await runRetrieve({
      argv: ['wibblefrazz'],
      startDir: DEFAULT_SCOPE_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    expect(result.candidates.map((candidate) => candidate.path.split('/').at(-1))).toEqual(['note.md']);
  });

  it('degrades a malformed config to the default and warns instead of failing the search', async () => {
    const result = await runRetrieve({
      argv: ['splonktastic'],
      startDir: MALFORMED_CONFIG_VAULT,
      now: NOW,
      home: FIXTURES,
    });

    // The content/ note still recalls under the degraded default config, and the defect surfaces as one warning.
    expect(result.candidates.map((candidate) => candidate.path.split('/').at(-1))).toEqual(['note.md']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/config invalid/);
    expect(result.diagnostic).toBeUndefined();
  });
});

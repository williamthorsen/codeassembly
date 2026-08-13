import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildRecallStub } from '../../test-utils/build-recall-stub.ts';
import { parseArgs, runRetrieve } from '../cli.ts';

// The vault and registry fixtures live with the shared search primitive (kb-search), which owns scope and recall; the
// retrieve command's integration tests reuse them.
const FIXTURES = join(import.meta.dirname, '..', '..', 'kb-search', '__tests__', 'fixtures');
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
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'streams.md')] }),
    });

    expect(result.candidates.map((candidate) => candidate.title)).toContain('Working with Node.js streams');
    expect(result.diagnostic).toBeUndefined();
  });

  it('excludes an event record from the assertion candidate table, pointing the reader at event recall', async () => {
    const result = await runRetrieve({
      argv: ['phantomwidget'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [eventNote('01HZCEVENTAAAAAAAAAAAAAAAA.md')] }),
    });

    // The only recalled note is an event, so the assertion table is empty and the diagnostic routes to event recall.
    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toMatch(/kb-retrieve-events/);
  });

  it('surfaces a note with no recordType as a degraded candidate via the transitional tolerance', async () => {
    const result = await runRetrieve({
      argv: ['untypedquux'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'legacy-untyped.md')] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.title).toBe('A legacy note without a record type');
    expect(result.candidates[0]?.diagnostic).toMatch(/no recordType/);
  });

  it('applies the --diataxis filter to the candidate table', async () => {
    const result = await runRetrieve({
      argv: ['deployment', '--diataxis', 'howto'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
      // hooks.md is diataxis: reference, so the filter has something to exclude.
      recall: buildRecallStub({
        hits: [
          join(NOTES_VAULT, 'new-guide.md'),
          join(NOTES_VAULT, 'mid-guide.md'),
          join(NOTES_VAULT, 'sub', 'hooks.md'),
        ],
      }),
    });

    expect(result.candidates.every((candidate) => candidate.diataxis === 'howto')).toBe(true);
    expect(result.candidates).toHaveLength(2);
  });

  it('reports a diagnostic and no candidates when nothing matches', async () => {
    const result = await runRetrieve({
      argv: ['zzzznomatch'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub(),
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
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'streams.md')] }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.diagnostic).toBe('all matches were filtered out');
  });

  it('reports a diagnostic when no knowledge base is configured or discovered', async () => {
    const result = await runRetrieve({
      argv: ['anything'],
      startDir: '/',
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub(),
    });

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
      recall: buildRecallStub(),
    });

    expect(result.scopedKbs).toEqual([]);
    expect(result.diagnostic).toBe('store "no-such-store" is not registered in kb.yaml');
  });

  it('reports a diagnostic when the query is blank', async () => {
    const result = await runRetrieve({
      argv: ['--all-kbs'],
      startDir: NOTES_VAULT,
      now: NOW,
      recall: buildRecallStub(),
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toBe('no query provided');
  });

  it('names the registry defect in warnings and diagnostic when a malformed registry is the only KB', async () => {
    const result = await runRetrieve({
      argv: ['anything'],
      startDir: MALFORMED_NO_KB,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub(),
    });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^registry invalid: /);
    expect(result.diagnostic).toMatch(/^registry invalid: /);
  });

  it('returns candidates while still warning about a malformed registry alongside a discovered KB', async () => {
    const result = await runRetrieve({
      argv: ['zarquon'],
      startDir: MALFORMED_REGISTRY,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(MALFORMED_REGISTRY, 'searchable-note.md')] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^registry invalid: /);
    expect(result.diagnostic).toBeUndefined();
  });

  it('warns about a dead-path entry that is the only KB and excludes it from scopedKbs', async () => {
    const ghostPath = join(DEAD_PATH_REGISTRY, '.agents', 'no-such-kb-directory');
    const result = await runRetrieve({
      argv: ['anything'],
      startDir: DEAD_PATH_REGISTRY,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ missing: [ghostPath] }),
    });

    expect(result.candidates).toEqual([]);
    expect(result.scopedKbs).toEqual([]);
    expect(result.warnings).toEqual([`registry KB "ghost-vault" path does not exist: ${ghostPath}`]);
    expect(result.diagnostic).toBe('no notes matched the query');
  });

  it('returns candidates while warning about a dead-path entry alongside a live KB', async () => {
    const ghostPath = join(MIXED_REGISTRY, '.agents', 'no-such-kb-directory');
    const result = await runRetrieve({
      argv: ['backpressure', '--all-kbs'],
      startDir: MIXED_REGISTRY,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'streams.md')], missing: [ghostPath] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toEqual([`registry KB "ghost-vault" path does not exist: ${ghostPath}`]);
    expect(result.diagnostic).toBeUndefined();
  });

  it('keeps warnings empty when no registry is configured and a discovered KB is searched', async () => {
    const result = await runRetrieve({
      argv: ['backpressure'],
      startDir: NOTES_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(NOTES_VAULT, 'streams.md')] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('excludes a custom non-assertion record type from the assertion candidate table', async () => {
    const result = await runRetrieve({
      argv: ['phantomtimer'],
      startDir: CUSTOM_SCHEMA_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(CUSTOM_SCHEMA_VAULT, 'insight-note.md')] }),
    });

    // insight-note declares recordType: insight — neither an assertion nor an event — so no retrieve command claims it.
    expect(result.candidates).toEqual([]);
    expect(result.diagnostic).toMatch(/none are assertions/);
    expect(result.warnings).toEqual([]);
  });

  it('leaves a malformed store schema inert: it no longer affects recall or warns', async () => {
    const result = await runRetrieve({
      argv: ['brokenschema'],
      startDir: MALFORMED_SCHEMA_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(MALFORMED_SCHEMA_VAULT, 'plain-note.md')] }),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    // Ranking is unaffected: the assertion note still ranks by freshness (2026-04-20 to 2026-05-01).
    expect(result.candidates[0]?.lastVerifiedAgeDays).toBe(11);
    expect(result.diagnostic).toBeUndefined();
  });

  it('surfaces the valid store assertion and excludes non-assertion records in one multi-store search', async () => {
    const result = await runRetrieve({
      argv: ['crossstore', '--all-kbs'],
      startDir: MULTI_SCHEMA_REGISTRY,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({
        hits: [join(CUSTOM_SCHEMA_VAULT, 'insight-note.md'), join(MALFORMED_SCHEMA_VAULT, 'plain-note.md')],
      }),
    });

    const insight = result.candidates.find((candidate) => candidate.path.includes('insight-note.md'));
    const plain = result.candidates.find((candidate) => candidate.path.includes('plain-note.md'));
    // A non-assertion record type is excluded from recall; the assertion surfaces; the malformed sibling schema is inert.
    expect(insight).toBeUndefined();
    expect(plain).toBeDefined();
    expect(result.warnings.filter((warning) => /schema invalid/.test(warning))).toHaveLength(0);
  });

  it('recalls only notes inside the configured targets, skipping root and excluded markdown', async () => {
    // scoped-vault's config targets `content/**/*.md` and excludes `content/drafts/**`, so of the three recalled
    // notes only in-scope.md is inside the note set.
    const result = await runRetrieve({
      argv: ['zephyrquux'],
      startDir: SCOPED_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({
        hits: [
          join(SCOPED_VAULT, 'README.md'),
          join(SCOPED_VAULT, 'content', 'drafts', 'excluded.md'),
          join(SCOPED_VAULT, 'content', 'in-scope.md'),
        ],
      }),
    });

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
      recall: buildRecallStub({
        hits: [join(DEFAULT_SCOPE_VAULT, 'README.md'), join(DEFAULT_SCOPE_VAULT, 'content', 'note.md')],
      }),
    });

    expect(result.candidates.map((candidate) => candidate.path.split('/').at(-1))).toEqual(['note.md']);
  });

  it('degrades a malformed config to the default and warns instead of failing the search', async () => {
    const result = await runRetrieve({
      argv: ['splonktastic'],
      startDir: MALFORMED_CONFIG_VAULT,
      now: NOW,
      home: FIXTURES,
      recall: buildRecallStub({ hits: [join(MALFORMED_CONFIG_VAULT, 'content', 'note.md')] }),
    });

    // The content/ note still survives under the degraded default config, and the defect surfaces as one warning.
    expect(result.candidates.map((candidate) => candidate.path.split('/').at(-1))).toEqual(['note.md']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/config invalid/);
    expect(result.diagnostic).toBeUndefined();
  });
});

/** Resolves an event record's filename to its absolute path in the shared fixture vault. */
function eventNote(name: string): string {
  return join(NOTES_VAULT, 'content', 'events', name);
}

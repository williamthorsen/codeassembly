/* eslint n/no-process-exit: off */
/* eslint unicorn/no-process-exit: off */
import { realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { NoteScopeMatcher } from '@codeassembly/kb/config';
import { createNoteScopeMatcher, defaultKbConfig, loadKbConfig } from '@codeassembly/kb/config';
import type { Schema } from '@codeassembly/kb/schema';
import { defaultSchema, loadSchema } from '@codeassembly/kb/schema';

import { type FlagSpec, scanFlags, valueFlagMap } from '../lib/parse-flags.ts';
import { normalizeHits } from './normalize.ts';
import { recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RawHit, RecallFilters, RetrieveResult, ScopedKb } from './types.ts';

/** The flags this helper accepts; positionals join into the free-text query. `--kb` is an alias for `--store`. */
const FLAGS: readonly FlagSpec[] = [
  { name: 'all-kbs', takesValue: false },
  { name: 'store', aliases: ['kb'], takesValue: true },
  { name: 'diataxis', takesValue: true },
  { name: 'tag', takesValue: true },
  { name: 'folder', takesValue: true },
];

/** Parsed command-line invocation of the kb-retrieve helper. */
export interface ParsedArgs {
  /** The free-text query string (all non-flag tokens, joined by spaces). */
  query: string;
  /** Whether `--all-kbs` widened scope to every registered KB. */
  allKbs: boolean;
  /** The registry name from `--store`/`--kb`, scoping recall to that store alone (no cwd-walk); `null` when absent. */
  storeName: string | null;
  /** The mechanical filters from `--diataxis`, `--tag`, `--folder`. */
  filters: RecallFilters;
}

/** Executes the helper from `process.argv` and write the JSON result to stdout. */
async function main(): Promise<void> {
  try {
    const result = await runRetrieve({
      argv: process.argv.slice(2),
      startDir: process.cwd(),
      now: new Date(),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`kb-retrieve: ${message}\n`);
    process.exit(1);
  }
}

// Run as a script, but not when imported by tests.
if (isEntryPoint()) {
  await main();
}

// region | Helpers

/**
 * Returns true when this module is the process entry point. Both sides are resolved through `realpathSync`, so that a
 * symlinked invocation path (e.g. a `mktemp` directory under `/var` that resolves to `/private/var`) still matches.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

/**
 * Parses the helper's argv into a query, the `--all-kbs` flag, the `--store`/`--kb` store scope, and the
 * `--diataxis`/`--tag`/`--folder` filters. Each value-bearing flag accepts both `--flag value` and `--flag=value`.
 * An unknown flag, or a value-bearing flag given no value (or an empty one), throws with a usage-style message.
 *
 * @internal - Exported to allow testing.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const { positionals, flags } = scanFlags(argv, FLAGS);
  const values = valueFlagMap(flags);

  const storeName = values.store ?? null;
  if (storeName === '') {
    throw new Error('--store requires a value');
  }

  const filters: RecallFilters = {};
  for (const key of ['diataxis', 'tag', 'folder'] as const) {
    const value = values[key];
    if (value === '') {
      throw new Error(`--${key} requires a value`);
    }
    if (value !== undefined) {
      filters[key] = value;
    }
  }

  return {
    query: positionals.join(' ').trim(),
    allKbs: flags.some((flag) => flag.name === 'all-kbs'),
    storeName,
    filters,
  };
}

/**
 * Runs the helper end to end: Parses args, resolves scope, recalls via ripgrep, normalizes hits, and prints
 * the candidate table as JSON to stdout. A no-KB or no-match outcome prints an empty candidate list with a `diagnostic`
 * field rather than throwing. Returns the structured result for in-process callers.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate registry
 * resolution from the developer's environment.
 *
 * @internal - Exported to allow testing.
 */
export async function runRetrieve(input: {
  argv: readonly string[];
  startDir: string;
  now: Date;
  home?: string;
}): Promise<RetrieveResult> {
  const { query, allKbs, storeName, filters } = parseArgs(input.argv);

  if (query === '') {
    return { candidates: [], scopedKbs: [], warnings: [], diagnostic: 'no query provided' };
  }

  const {
    kbs: inScopeKbs,
    registryError,
    storeNotFound,
  } = await resolveScope({
    startDir: input.startDir,
    allKbs,
    ...(storeName !== null && { storeName }),
    ...(input.home !== undefined && { home: input.home }),
  });
  if (inScopeKbs.length === 0) {
    // A malformed registry that contributes no entries reads identically to "no registry" in `scopedKbs`, so name
    // the failure in the diagnostic to distinguish a defect to fix from an absent registry.
    const diagnostic = emptyScopeDiagnostic({ storeNotFound, registryError });
    return { candidates: [], scopedKbs: [], warnings: composeWarnings({ registryError, missingKbs: [] }), diagnostic };
  }

  const { hits: rawHits, missingKbs } = await recallNotes({ query, scopedKbs: inScopeKbs });

  // Scope ripgrep's raw hits to each KB's configured note set — the same `targets`/`exclude` definition `kb check`
  // enforces — so non-note markdown under the root and excluded paths never reach the candidate table.
  const { matchers, warnings: configWarnings } = await loadMatchersForHits({ hits: rawHits, scopedKbs: inScopeKbs });
  const hits = rawHits.filter((hit) => isNoteHit(hit, matchers));

  const { schemas, warnings: schemaWarnings } = await loadSchemasForHits({ hits, scopedKbs: inScopeKbs });
  const unreadableHitWarnings: string[] = [];
  const candidates = await normalizeHits({ hits, filters, now: input.now, warnings: unreadableHitWarnings, schemas });

  // `scopedKbs` reports the KBs actually searched, so exclude any whose path was missing; the dead paths surface in
  // `warnings` instead.
  const searchedKbs = inScopeKbs.filter((kb) => !missingKbs.some((missing) => missing.path === kb.path));

  const result: RetrieveResult = {
    candidates,
    scopedKbs: searchedKbs,
    warnings: [
      ...composeWarnings({ registryError, missingKbs }),
      ...configWarnings,
      ...schemaWarnings,
      ...unreadableHitWarnings,
    ],
  };
  if (candidates.length === 0) {
    // Distinguish a query that found nothing from a query that found hits which were then excluded by
    // `--diataxis` / `--tag` / `--folder`, so the caller knows whether to broaden the query or drop a filter.
    result.diagnostic = hits.length === 0 ? 'no notes matched the query' : 'all matches were filtered out';
  }
  return result;
}

/** Returns true when a hit's path falls inside its KB's configured note set; a KB with no matcher keeps all hits. */
function isNoteHit(hit: RawHit, matchers: Map<string, NoteScopeMatcher>): boolean {
  const matcher = matchers.get(hit.kbPath);
  return matcher === undefined || matcher.isNote(toRelativePath(hit.kbPath, hit.path));
}

/** Renders a hit's absolute path as the slash-separated, KB-root-relative path the note-scope matcher expects. */
function toRelativePath(kbPath: string, notePath: string): string {
  return relative(kbPath, notePath).split(sep).join('/');
}

/**
 * Builds a note-scope matcher for every KB that produced a hit, keyed by KB root path, so recall can drop hits that
 * fall outside the KB's configured `targets`/`exclude` — the same definition `kb check` enforces. A KB whose
 * `.kb/config.yaml` is malformed degrades to {@link defaultKbConfig} and contributes a config-health warning, so one
 * bad config never fails a multi-store search (mirroring {@link loadSchemasForHits}).
 */
async function loadMatchersForHits(input: {
  hits: RawHit[];
  scopedKbs: ScopedKb[];
}): Promise<{ matchers: Map<string, NoteScopeMatcher>; warnings: string[] }> {
  const matchers = new Map<string, NoteScopeMatcher>();
  const warnings: string[] = [];
  for (const kbPath of new Set(input.hits.map((hit) => hit.kbPath))) {
    let config = defaultKbConfig;
    try {
      config = await loadKbConfig({ kbRoot: { path: kbPath, kbDir: join(kbPath, '.kb'), via: 'ancestor-walk' } });
    } catch (error) {
      warnings.push(formatConfigInvalid({ kbPath, scopedKbs: input.scopedKbs, error }));
    }
    matchers.set(kbPath, createNoteScopeMatcher(config));
  }
  return { matchers, warnings };
}

/**
 * Phrases the config-health warning for a KB whose `.kb/config.yaml` could not be loaded. A named registry entry
 * reports its name; a `.kb/`-discovered KB (no registry name) reports its path.
 */
function formatConfigInvalid(input: { kbPath: string; scopedKbs: ScopedKb[]; error: unknown }): string {
  const name = input.scopedKbs.find((kb) => kb.path === input.kbPath)?.name ?? null;
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return name === null
    ? `discovered KB config invalid at ${input.kbPath}: ${message}`
    : `registry KB "${name}" config invalid: ${message}`;
}

/**
 * Loads the effective schema for every KB that produced a hit, keyed by KB root path, so normalization can drive each
 * note's ranking signals from its record type's declared `recall` policy. Only KBs with hits are read. A KB whose
 * `.kb/schema.yaml` is malformed degrades to the bundled default schema and contributes a schema-health warning, so
 * one bad schema never fails a multi-store search.
 */
async function loadSchemasForHits(input: {
  hits: RawHit[];
  scopedKbs: ScopedKb[];
}): Promise<{ schemas: Map<string, Schema>; warnings: string[] }> {
  const schemas = new Map<string, Schema>();
  const warnings: string[] = [];
  for (const kbPath of new Set(input.hits.map((hit) => hit.kbPath))) {
    try {
      const schema = await loadSchema({ kbRoot: { path: kbPath, kbDir: join(kbPath, '.kb'), via: 'ancestor-walk' } });
      schemas.set(kbPath, schema);
    } catch (error) {
      schemas.set(kbPath, defaultSchema);
      warnings.push(formatSchemaInvalid({ kbPath, scopedKbs: input.scopedKbs, error }));
    }
  }
  return { schemas, warnings };
}

/**
 * Phrases the schema-health warning for a KB whose `.kb/schema.yaml` could not be loaded. A named registry entry
 * reports its name; a `.kb/`-discovered KB (no registry name) reports its path.
 */
function formatSchemaInvalid(input: { kbPath: string; scopedKbs: ScopedKb[]; error: unknown }): string {
  const name = input.scopedKbs.find((kb) => kb.path === input.kbPath)?.name ?? null;
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  return name === null
    ? `discovered KB schema invalid at ${input.kbPath}: ${message}`
    : `registry KB "${name}" schema invalid: ${message}`;
}

/**
 * Phrases the operator-facing registry-health warnings in deterministic order: the malformed-registry warning first,
 * then one dead-path warning per missing KB in registry/scope order. A named entry reports its name and path; a
 * registry-less discovered KB (`name === null`, only reachable under a TOCTOU race) reports just its path.
 */
function composeWarnings(input: { registryError: string | undefined; missingKbs: ScopedKb[] }): string[] {
  const warnings: string[] = [];
  if (input.registryError !== undefined) {
    warnings.push(formatRegistryInvalid(input.registryError));
  }
  for (const kb of input.missingKbs) {
    warnings.push(
      kb.name === null
        ? `discovered KB path does not exist: ${kb.path}`
        : `registry KB "${kb.name}" path does not exist: ${kb.path}`,
    );
  }
  return warnings;
}

/** Single source for the malformed-registry message, shared by the empty-scope diagnostic and the warnings channel so the two cannot drift. */
function formatRegistryInvalid(registryError: string): string {
  return `registry invalid: ${registryError}`;
}

/** Phrases the run-level diagnostic for an empty scope: a named store-not-found, a malformed registry, or no KB at all. */
function emptyScopeDiagnostic(input: { storeNotFound: string | undefined; registryError: string | undefined }): string {
  if (input.storeNotFound !== undefined) {
    return `store "${input.storeNotFound}" is not registered in kb.yaml`;
  }
  if (input.registryError !== undefined) {
    return formatRegistryInvalid(input.registryError);
  }
  return 'no knowledge base configured or discovered';
}

// endregion | Helpers

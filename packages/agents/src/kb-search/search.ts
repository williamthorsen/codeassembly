import { relative, sep } from 'node:path';

import type { NoteScopeMatcher } from '@codeassembly/kb/config';
import { createNoteScopeMatcher, defaultKbConfig, loadKbConfig } from '@codeassembly/kb/config';
import type { ParsedNote } from '@codeassembly/kb/frontmatter';
import { resolveKbDir } from '@codeassembly/kb/layout';

import { extractString, parseNoteSafely } from '../kb-shared/note-helpers.ts';
import type { RecallFn } from './recall.ts';
import { recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RawHit, RecallFilters, ScopedKb, SearchHit, SearchResult } from './types.ts';

/**
 * Runs the shared, type-blind recall pipeline both retrieve commands call: resolves which knowledge bases to search,
 * recalls candidate notes with ripgrep, scopes the hits to each KB's configured note set, parses each surviving note,
 * and applies the mechanical `--diataxis`/`--tag`/`--folder` filters. Returns the parsed hits plus the run-level signals
 * — searched KBs, ordered health warnings, the pre-filter hit count, and an empty-scope diagnostic — that each command
 * composes its own candidate table and diagnostics from. Each command selects the hits it owns by the parsed note's
 * `recordType`.
 *
 * An empty scope (no KB discovered or configured, an unknown `--store`, or a malformed registry) returns no hits and an
 * `emptyScopeDiagnostic`; a no-match run returns no hits with `recalledCount` 0. A note whose file cannot be read at
 * parse time is skipped and reported in `warnings` rather than dropped silently. A note that parses but carries no
 * frontmatter still becomes a hit (a degraded one), so a broken note is not hidden from the projecting command.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it exists so tests can isolate registry
 * resolution from the developer's environment. `recall` overrides how candidate notes are recalled, defaulting to
 * ripgrep; it exists so a test of scoping, filtering, or projection never spawns a process.
 */
export async function searchNotes(input: {
  query: string;
  allKbs: boolean;
  storeName?: string;
  filters: RecallFilters;
  startDir: string;
  home?: string;
  recall?: RecallFn;
}): Promise<SearchResult> {
  const {
    kbs: inScopeKbs,
    registryError,
    storeNotFound,
  } = await resolveScope({
    startDir: input.startDir,
    allKbs: input.allKbs,
    ...(input.storeName !== undefined && { storeName: input.storeName }),
    ...(input.home !== undefined && { home: input.home }),
  });
  if (inScopeKbs.length === 0) {
    return {
      hits: [],
      scopedKbs: [],
      warnings: composeWarnings({ registryError, missingKbs: [] }),
      recalledCount: 0,
      emptyScopeDiagnostic: composeEmptyScopeDiagnostic({ storeNotFound, registryError }),
    };
  }

  const recall = input.recall ?? recallNotes;
  const { hits: rawHits, missingKbs } = await recall({ query: input.query, scopedKbs: inScopeKbs });

  // Scope ripgrep's raw hits to each KB's configured note set — the same `targets`/`exclude` definition `kb check`
  // enforces — so non-note markdown under the root and excluded paths never reach the candidate table.
  const { matchers, warnings: configWarnings } = await loadMatchersForHits({ hits: rawHits, scopedKbs: inScopeKbs });
  const noteHits = rawHits.filter((hit) => isNoteHit(hit, matchers));

  const unreadableWarnings: string[] = [];
  const hits: SearchHit[] = [];
  for (const hit of noteHits) {
    const parsed = await parseNoteSafely(hit.path);
    if (parsed.note === null) {
      unreadableWarnings.push(`note at "${hit.path}" could not be read: ${parsed.error}`);
      continue;
    }
    if (!passesFilters({ note: parsed.note, path: hit.path, filters: input.filters })) {
      continue;
    }
    hits.push({ hit, note: parsed.note });
  }

  // `scopedKbs` reports the KBs actually searched, so exclude any whose path was missing; the dead paths surface in
  // `warnings` instead.
  const searchedKbs = inScopeKbs.filter((kb) => missingKbs.every((missing) => missing.path !== kb.path));

  return {
    hits,
    scopedKbs: searchedKbs,
    warnings: [...composeWarnings({ registryError, missingKbs }), ...configWarnings, ...unreadableWarnings],
    recalledCount: noteHits.length,
  };
}

/**
 * The note's stored record type, defaulting to empty when frontmatter is missing or declares no recordType. A retrieve
 * command filters search hits to the record type it owns (e.g. `assertion`, `event`).
 */
export function recordTypeOf(hit: SearchHit): string {
  return hit.note.frontmatter?.recordType ?? '';
}

// region | Helpers

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
 * bad config never fails a multi-store search.
 */
async function loadMatchersForHits(input: {
  hits: RawHit[];
  scopedKbs: ScopedKb[];
}): Promise<{ matchers: Map<string, NoteScopeMatcher>; warnings: string[] }> {
  const matchers = new Map<string, NoteScopeMatcher>();
  const warnings: string[] = [];
  const kbPaths = new Set(input.hits.map((rawHit) => rawHit.kbPath));
  for (const kbPath of kbPaths) {
    let config = defaultKbConfig;
    try {
      config = await loadKbConfig({ kbRoot: { path: kbPath, kbDir: resolveKbDir(kbPath) } });
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
 * Applies the mechanical `--diataxis`, `--tag`, and `--folder` filters. A note with no parseable frontmatter fails
 * `--diataxis` and `--tag` (it carries no typed fields) but is still subject to the path-based `--folder` filter.
 */
function passesFilters(input: { note: ParsedNote; path: string; filters: RecallFilters }): boolean {
  const { note, path, filters } = input;

  if (filters.folder !== undefined && !path.toLowerCase().includes(`/${filters.folder.toLowerCase()}/`)) {
    return false;
  }

  const frontmatter = note.frontmatter;
  if (
    filters.diataxis !== undefined &&
    extractString(frontmatter?.extra, 'diataxis')?.toLowerCase() !== filters.diataxis.toLowerCase()
  ) {
    return false;
  }
  if (filters.tag !== undefined) {
    const wanted = filters.tag.toLowerCase();
    const tags = frontmatter?.tags ?? [];
    if (tags.every((tag) => tag.toLowerCase() !== wanted)) {
      return false;
    }
  }
  return true;
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
function composeEmptyScopeDiagnostic(input: {
  storeNotFound: string | undefined;
  registryError: string | undefined;
}): string {
  if (input.storeNotFound !== undefined) {
    return `store "${input.storeNotFound}" is not registered in kb.yaml`;
  }
  if (input.registryError !== undefined) {
    return formatRegistryInvalid(input.registryError);
  }
  return 'no knowledge base configured or discovered';
}

// endregion | Helpers

import { relative, sep } from 'node:path';

import {
  createNoteScopeMatcher,
  defaultKbConfig,
  loadKbConfig,
  type NoteScopeMatcher,
} from '@williamthorsen/kb/config';
import type { ParsedNote } from '@williamthorsen/kb/frontmatter';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { extractString, parseNoteSafely } from '../kb-shared/note-helpers.ts';
import { type RecallFn, recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RawHit, RecallFilters, ScopedKb, SearchHit, SearchResult } from './types.ts';

/**
 * Recalls the notes matching `query` across every in-scope knowledge base, scoping each hit to its KB's configured
 * note set and applying the mechanical filters.
 *
 * Returns no hits and an `emptyScopeDiagnostic` for an empty scope. Skips a note whose file cannot be read, reporting
 * it in `warnings`. Keeps a note that parses but carries no frontmatter as a degraded hit.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read, and `recall` replaces the default
 * ripgrep recall; both exist so that a test can run against fixtures without spawning a process.
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

  const searchedKbs = inScopeKbs.filter((kb) => missingKbs.every((missing) => missing.path !== kb.path));

  return {
    hits,
    scopedKbs: searchedKbs,
    warnings: [...composeWarnings({ registryError, missingKbs }), ...configWarnings, ...unreadableWarnings],
    recalledCount: noteHits.length,
  };
}

/**
 * Returns the note's stored record type, empty when frontmatter is missing or declares none. A retrieve command
 * selects the hits that it owns by this value (e.g. `assertion`, `event`).
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

/** Renders a hit's absolute path as the slash-separated, KB-root-relative path that the note-scope matcher expects. */
function toRelativePath(kbPath: string, notePath: string): string {
  return relative(kbPath, notePath).split(sep).join('/');
}

/**
 * Builds a note-scope matcher for every KB that produced a hit, keyed by KB root path. A KB whose `.kb/config.yaml` is
 * malformed degrades to {@link defaultKbConfig} and contributes a config-health warning, so one bad config never fails
 * a multi-store search.
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

/** Phrases the config-health warning for a KB whose `.kb/config.yaml` could not be loaded. */
function formatConfigInvalid(input: { kbPath: string; scopedKbs: ScopedKb[]; error: unknown }): string {
  const name = input.scopedKbs.find((kb) => kb.path === input.kbPath)?.name ?? null;
  const message = describeError(input.error);
  return name === null
    ? `discovered KB config invalid at ${input.kbPath}: ${message}`
    : `registry KB "${name}" config invalid: ${message}`;
}

/**
 * Applies the mechanical filters to one note. A note with no parseable frontmatter fails `--diataxis` and `--tag`; the
 * path-based `--folder` filter still applies to it.
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
 * then one dead-path warning per missing KB. A missing KB carrying no registry name is only reachable under a race
 * between discovery and the existence check.
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

/** Phrases the malformed-registry message, so that the two channels that report it cannot drift. */
function formatRegistryInvalid(registryError: string): string {
  return `registry invalid: ${registryError}`;
}

/** Phrases the run-level diagnostic for an empty scope. */
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

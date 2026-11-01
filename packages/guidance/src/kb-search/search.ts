import { relative, sep } from 'node:path';

import {
  createNoteScopeMatcher,
  defaultKbConfig,
  loadKbConfig,
  type NoteScopeMatcher,
} from '@williamthorsen/kb/config';
import type { ParsedNote } from '@williamthorsen/kb/frontmatter';
import { resolveKbDir } from '@williamthorsen/kb/layout';
import { type AliasMap, canonicalize } from '@williamthorsen/kb/tags';
import { describeError } from '@williamthorsen/toolbelt.errors';

import { extractString, parseNoteSafely } from '../kb-shared/note-helpers.ts';
import { loadAliasesOrEmpty } from '../kb-shared/tag-helpers.ts';
import { type RecallFn, recallNotes } from './recall.ts';
import { resolveScope } from './scope.ts';
import type { RawHit, RecallFilters, ScopedKb, SearchHit, SearchResult } from './types.ts';

/**
 * Recalls the notes matching `query` across every in-scope knowledge base, scoping each hit to its KB's configured
 * note set and applying the mechanical filters.
 *
 * Returns an empty hit list and an `emptyScopeDiagnostic` for an empty scope. Skips a note whose file cannot be read,
 * reporting it in `warnings`. Keeps a note that parses but does not have frontmatter as a degraded hit.
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
  const aliasesByKb = await loadAliasesForHits(noteHits);

  const unreadableWarnings: string[] = [];
  const hits: SearchHit[] = [];
  for (const hit of noteHits) {
    const parsed = await parseNoteSafely(hit.path);
    if (parsed.note === null) {
      unreadableWarnings.push(`note at "${hit.path}" could not be read: ${parsed.error}`);
      continue;
    }
    const aliases = aliasesByKb.get(hit.kbPath) ?? new Map<string, string>();
    if (!passesFilters({ note: parsed.note, path: hit.path, filters: input.filters, aliases })) {
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

/** Reports whether any of the note's tags equals one of `wanted` once both sides are canonicalized through `aliases`. */
function hasAnyTag(input: { noteTags: readonly string[]; wanted: readonly string[]; aliases: AliasMap }): boolean {
  const { noteTags, wanted, aliases } = input;
  const wantedCanonical = new Set(wanted.map((tag) => canonicalize(tag, aliases).toLowerCase()));
  return noteTags.some((tag) => wantedCanonical.has(canonicalize(tag, aliases).toLowerCase()));
}

/**
 * Returns true when a hit's path is inside its KB's configured note set, or when that KB does not have a matcher, which
 * admits every hit.
 */
function isNoteHit(hit: RawHit, matchers: Map<string, NoteScopeMatcher>): boolean {
  const matcher = matchers.get(hit.kbPath);
  return matcher === undefined || matcher.isNote(toRelativePath(hit.kbPath, hit.path));
}

/** Renders a hit's absolute path as the slash-separated, KB-root-relative path that the note-scope matcher expects. */
function toRelativePath(kbPath: string, notePath: string): string {
  return relative(kbPath, notePath).split(sep).join('/');
}

/**
 * Builds a note-scope matcher for every KB that produced a hit, keyed by KB root path. Uses {@link defaultKbConfig} for
 * a KB whose `.kb/config.yaml` is malformed and adds a config-health warning, so one bad config never fails a
 * multi-store search.
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

/** Loads the tag-alias map of every KB that produced a hit, keyed by KB root path. */
async function loadAliasesForHits(hits: readonly RawHit[]): Promise<Map<string, AliasMap>> {
  const aliasesByKb = new Map<string, AliasMap>();
  for (const kbPath of new Set(hits.map((hit) => hit.kbPath))) {
    aliasesByKb.set(kbPath, await loadAliasesOrEmpty(kbPath));
  }
  return aliasesByKb;
}

/**
 * Applies the mechanical filters to one note, matching tags through the note's KB `aliases`. A note without parseable
 * frontmatter fails `--diataxis` and `--tag` and passes `excludeTags`; the path-based `--folder` filter still applies
 * to it.
 */
function passesFilters(input: { note: ParsedNote; path: string; filters: RecallFilters; aliases: AliasMap }): boolean {
  const { note, path, filters, aliases } = input;

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
  const noteTags = frontmatter?.tags ?? [];
  if (filters.tag !== undefined && !hasAnyTag({ noteTags, wanted: [filters.tag], aliases })) {
    return false;
  }
  if (filters.excludeTags !== undefined && hasAnyTag({ noteTags, wanted: filters.excludeTags, aliases })) {
    return false;
  }
  return true;
}

/**
 * Phrases the operator-facing registry-health warnings in deterministic order: the malformed-registry warning first,
 * then one dead-path warning per missing KB. A missing KB without a registry name can occur only in a race
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

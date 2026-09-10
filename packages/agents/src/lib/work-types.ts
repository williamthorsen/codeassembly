import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BreakingPolicy, Taxonomy, WorkTypeEntry } from '../change-grammar/types.ts';
import { isMissingFile, isRecord } from './type-guards.ts';

/** A declared work type: its canonical key and the tier its changes belong to. */
export interface WorkType {
  key: string;
  tier: string;
}

/** A spelled work type resolved against the taxonomy: the entry it names, and whether it carried the breaking marker. */
export interface ResolvedWorkType {
  workType: WorkType;
  breaking: boolean;
}

/**
 * Loads the taxonomy from `work-types.json` under `dataDir` in the ordered form the change-grammar engine takes: the
 * declared tiers, and every type in listing order with its aliases and breaking policy. Yields `null` when the file is
 * absent, unparseable, or declares no `types` list.
 *
 * `loadWorkTypes` reads the same file into a lookup indexed by key and alias, which discards the listing order. The
 * order is what ranks one type over another, so a caller consolidating entries reads this form instead.
 */
export async function loadTaxonomy(dataDir: string): Promise<Taxonomy | null> {
  const parsed = await readTaxonomyFile(dataDir);
  if (parsed === null) {
    return null;
  }

  const types: WorkTypeEntry[] = [];
  for (const entry of parsed.types) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.tier !== 'string') {
      continue;
    }
    types.push({
      aliases: readAliases(entry.aliases),
      key: entry.key,
      tier: entry.tier,
      ...(isBreakingPolicy(entry.breakingPolicy) && { breakingPolicy: entry.breakingPolicy }),
    });
  }

  const tiers = Array.isArray(parsed.tiers) ? parsed.tiers.filter((tier) => typeof tier === 'string') : [];
  return { tiers, types };
}

/**
 * Loads the work-type taxonomy from `work-types.json` under `dataDir`, indexed by canonical key and by every declared
 * alias, so `feature` and `feat` reach one entry. Yields `null` when the file is absent, unparseable, or declares no
 * `types` list.
 *
 * The directory is a parameter rather than derived here: each helper defaults it to its own installed `_data` sibling,
 * and a test supplies a fixture directory instead of standing up an install layout.
 */
export async function loadWorkTypes(dataDir: string): Promise<ReadonlyMap<string, WorkType> | null> {
  const parsed = await readTaxonomyFile(dataDir);
  if (parsed === null) {
    return null;
  }

  const declared: Array<{ workType: WorkType; aliases: string[] }> = [];
  for (const entry of parsed.types) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.tier !== 'string') {
      continue;
    }
    declared.push({ workType: { key: entry.key, tier: entry.tier }, aliases: readAliases(entry.aliases) });
  }

  // Index the aliases first, so a canonical key outranks an alias that happens to spell it.
  const index = new Map<string, WorkType>();
  for (const { workType, aliases } of declared) {
    for (const alias of aliases) {
      index.set(alias, workType);
    }
  }
  for (const { workType } of declared) {
    index.set(workType.key, workType);
  }
  return index;
}

/**
 * Resolves a work type as spelled in a commit or pull-request title, reporting both the entry it names and whether it
 * carried the breaking marker. The taxonomy declares bare keys and models the marker separately under `markers`, so
 * `feat!` names the `feat` entry. Yields `null` for a type no entry declares, marker or not.
 *
 * The marker is reported rather than discarded because a caller recording the change needs both halves of the parse,
 * and re-deriving one from a stripped string would put the same rule in two places.
 */
export function resolveWorkType(type: string, workTypes: ReadonlyMap<string, WorkType>): ResolvedWorkType | null {
  const breaking = type.endsWith('!');
  const workType = workTypes.get(breaking ? type.slice(0, -1) : type);
  return workType === undefined ? null : { workType, breaking };
}

// region | Helpers

/** The breaking policies a taxonomy entry may declare. */
const BREAKING_POLICIES: ReadonlySet<string> = new Set(['forbidden', 'optional', 'required']);

/** Reports whether `value` names one of the declared breaking policies. */
function isBreakingPolicy(value: unknown): value is BreakingPolicy {
  return typeof value === 'string' && BREAKING_POLICIES.has(value);
}

/** Reads a declared `aliases` list, dropping any entry that is not a string. */
function readAliases(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((alias) => typeof alias === 'string') : [];
}

/**
 * Reads and parses `work-types.json` under `dataDir`, yielding `null` where the file is absent, unparseable, or
 * declares no `types` list. Both loaders build from the same read, so a change to what counts as a usable file lands
 * in one place.
 */
async function readTaxonomyFile(dataDir: string): Promise<{ tiers: unknown; types: unknown[] } | null> {
  let content: string;
  try {
    content = await readFile(path.join(dataDir, 'work-types.json'), 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.types)) {
    return null;
  }
  return { tiers: parsed.tiers, types: parsed.types };
}

// endregion | Helpers

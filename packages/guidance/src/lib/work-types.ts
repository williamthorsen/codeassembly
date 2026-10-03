import { readFile } from 'node:fs/promises';
import path from 'node:path';

import embeddedTaxonomy from '../../content/skills/_data/work-types.json' with { type: 'json' };
import type { BreakingPolicy, Taxonomy, WorkTypeEntry } from '../change-grammar/types.ts';
import { isMissingFile, isRecord } from './type-guards.ts';

/** A declared work type: its canonical key and the tier to which its changes belong. */
export interface WorkType {
  key: string;
  tier: string;
}

/**
 * A spelled work type resolved against the taxonomy: the entry that it names, and whether it included the breaking
 * marker.
 */
export interface ResolvedWorkType {
  workType: WorkType;
  breaking: boolean;
}

/**
 * Names where a taxonomy is read from, as a diagnostic's locative phrase: under `dataDir` when one is named, and in the
 * bundle otherwise.
 */
export function describeTaxonomyLocation(dataDir?: string): string {
  return dataDir === undefined ? 'in the bundle' : `under ${dataDir}`;
}

/**
 * Loads the taxonomy in the ordered form that the change-grammar engine takes: the declared tiers, and every type in
 * listing order with its aliases and breaking policy. Reads `work-types.json` under `dataDir` when one is named, and
 * the taxonomy embedded at build time otherwise. Yields `null` when the file is absent, unparseable, or doesn't declare
 * a `types` list.
 *
 * `loadWorkTypes` reads the same file into a lookup indexed by key and alias, which discards the listing order. The
 * order ranks one type over another, so a caller consolidating entries reads this form instead.
 */
export async function loadTaxonomy(dataDir?: string): Promise<Taxonomy | null> {
  const parsed = await readTaxonomy(dataDir);
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
 * Loads the work-type taxonomy indexed by canonical key and by every declared alias, so that `feature` and `feat`
 * resolve to one entry. Reads `work-types.json` under `dataDir` when one is named, and the taxonomy embedded at build
 * time otherwise. Yields `null` when the file is absent, unparseable, or doesn't declare a `types` list.
 */
export async function loadWorkTypes(dataDir?: string): Promise<ReadonlyMap<string, WorkType> | null> {
  const parsed = await readTaxonomy(dataDir);
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

  // Index the aliases first, so that a canonical key outranks an alias that happens to spell it.
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
 * Resolves a work type as spelled in a commit or pull-request title, reporting both the entry that it names and
 * whether it included the breaking marker. The taxonomy declares bare keys and models the marker separately under
 * `markers`, so `feat!` names the `feat` entry. Yields `null` for a type not declared by any entry, marker or not.
 */
export function resolveWorkType(type: string, workTypes: ReadonlyMap<string, WorkType>): ResolvedWorkType | null {
  const breaking = type.endsWith('!');
  const workType = workTypes.get(breaking ? type.slice(0, -1) : type);
  return workType === undefined ? null : { workType, breaking };
}

// region | Helpers

/** A taxonomy document that declares a `types` list, before its entries are checked. */
interface ParsedTaxonomy {
  tiers: unknown;
  types: unknown[];
}

/** The breaking policies that a taxonomy entry may declare. */
const BREAKING_POLICIES: ReadonlySet<string> = new Set(['forbidden', 'optional']);

/** Reports whether `value` names one of the declared breaking policies. */
function isBreakingPolicy(value: unknown): value is BreakingPolicy {
  return typeof value === 'string' && BREAKING_POLICIES.has(value);
}

/**
 * Validates a parsed taxonomy document, yielding `null` when it is not an object that declares a `types` list. The
 * entries themselves are checked by each loader.
 */
function parseTaxonomy(value: unknown): ParsedTaxonomy | null {
  if (!isRecord(value) || !Array.isArray(value.types)) {
    return null;
  }
  return { tiers: value.tiers, types: value.types };
}

/** Reads a declared `aliases` list, dropping any entry that is not a string. */
function readAliases(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((alias) => typeof alias === 'string') : [];
}

/** Reads the taxonomy under `dataDir` when one is named, and the embedded taxonomy otherwise. */
async function readTaxonomy(dataDir: string | undefined): Promise<ParsedTaxonomy | null> {
  return dataDir === undefined ? parseTaxonomy(embeddedTaxonomy) : await readTaxonomyFile(dataDir);
}

/** Reads and parses `work-types.json` under `dataDir`, yielding `null` when the file is absent or unparseable. */
async function readTaxonomyFile(dataDir: string): Promise<ParsedTaxonomy | null> {
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
  return parseTaxonomy(parsed);
}

// endregion | Helpers

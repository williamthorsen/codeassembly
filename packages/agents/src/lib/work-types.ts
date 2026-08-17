import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isMissingFile, isRecord } from './type-guards.ts';

/** A declared work type: its canonical key and the tier its changes belong to. */
export interface WorkType {
  key: string;
  tier: string;
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

  const declared: Array<{ workType: WorkType; aliases: string[] }> = [];
  for (const entry of parsed.types) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.tier !== 'string') {
      continue;
    }
    const aliases = Array.isArray(entry.aliases) ? entry.aliases.filter((alias) => typeof alias === 'string') : [];
    declared.push({ workType: { key: entry.key, tier: entry.tier }, aliases });
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

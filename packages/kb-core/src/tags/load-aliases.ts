import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parse } from 'yaml';

import { isEnoent, isRecord } from '../type-guards.ts';
import type { AliasMap, KbRoot } from '../types.ts';

/** Relative location of the tag-aliases file within a KB root. */
export const ALIASES_FILE = join('.kb', 'tag-aliases.yaml');

/**
 * Loads `.kb/tag-aliases.yaml` from a KB root into a typed `AliasMap`, returning an empty map when the file is absent.
 * The thin I/O wrapper around {@link parseAliases}; structural defects throw with the file path included.
 */
export async function loadAliases(input: { kbRoot: KbRoot }): Promise<AliasMap> {
  const path = join(input.kbRoot.path, ALIASES_FILE);

  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return new Map();
    }
    throw error;
  }

  return parseAliases(text, path);
}

/**
 * Parses a tag-aliases registry from a string into an `AliasMap`.
 * Aliases are lowercased on insertion so callers can look up case-insensitively.
 * Throws on any structural defect — non-object top level, missing `aliases` key, non-string entries, self-aliases,
 * or cross-canonical collisions — with `contextLabel` prefixed onto every message.
 */
export function parseAliases(text: string, contextLabel = 'tag-aliases'): AliasMap {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${contextLabel}: malformed YAML — ${message}`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${contextLabel}: top-level must be a mapping`);
  }
  if (!('aliases' in parsed)) {
    throw new Error(`${contextLabel}: missing required "aliases" key`);
  }
  const aliasesBlock = parsed.aliases;
  if (!isRecord(aliasesBlock)) {
    throw new Error(`${contextLabel}: "aliases" must be a mapping of canonical to alias list`);
  }

  const map = new Map<string, string>();
  for (const [canonical, value] of Object.entries(aliasesBlock)) {
    if (!Array.isArray(value)) {
      throw new TypeError(`${contextLabel}: "${canonical}" must be a list of alias strings`);
    }
    const seenInCanonical = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new TypeError(`${contextLabel}: alias entries under "${canonical}" must be string values`);
      }
      const alias = entry.toLowerCase();
      if (alias === canonical.toLowerCase()) {
        throw new Error(`${contextLabel}: alias "${entry}" equals its canonical "${canonical}"`);
      }
      if (seenInCanonical.has(alias)) {
        throw new Error(`${contextLabel}: alias "${entry}" is listed twice under canonical "${canonical}"`);
      }
      seenInCanonical.add(alias);
      const existing = map.get(alias);
      if (existing !== undefined && existing !== canonical) {
        throw new Error(
          `${contextLabel}: alias "${entry}" appears under multiple canonicals ("${existing}" and "${canonical}")`,
        );
      }
      map.set(alias, canonical);
    }
  }
  return map;
}

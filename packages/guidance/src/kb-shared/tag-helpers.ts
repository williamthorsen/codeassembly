import { resolveKbDir } from '@williamthorsen/kb/layout';
import { type AliasMap, loadAliases } from '@williamthorsen/kb/tags';

import { splitCommaList } from './note-helpers.ts';

/** Loads a KB's `tag-aliases.yaml`, returning an empty map when the file is absent or cannot be loaded. */
export async function loadAliasesOrEmpty(kbPath: string): Promise<AliasMap> {
  try {
    return await loadAliases({ kbRoot: { path: kbPath, kbDir: resolveKbDir(kbPath) } });
  } catch {
    return new Map();
  }
}

/**
 * Splits a comma-separated tag string into individual tags.
 * @internal
 */
export function parseTagList(value: string): string[] {
  return splitCommaList(value);
}

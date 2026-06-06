import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { parse as parseYaml } from 'yaml';

import { isEnoent, isRecord } from './type-guards.ts';

/**
 * Reads the project-scope rulebook declaration at `{projectRoot}/.agents/rulebooks.yaml` and returns the
 * deduplicated list of declared slugs. Returns `undefined` when the file is absent (a total no-op for `sync`),
 * distinct from a present-but-empty declaration, which returns `[]` (reconcile to nothing declared).
 */
export async function readRulebooksManifest(projectRoot: string): Promise<ReadonlyArray<string> | undefined> {
  const manifestPath = path.join(projectRoot, '.agents', 'rulebooks.yaml');

  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  const parsed: unknown = parseYaml(raw);
  // An empty or comment-only file parses to nullish and means "nothing declared". Any other non-mapping top
  // level (a bare list, a stray scalar) is a malformed manifest; erroring prevents sync from reading it as an
  // empty declaration and destructively retracting every installed rulebook.
  if (parsed === undefined || parsed === null) {
    return [];
  }
  if (!isRecord(parsed)) {
    throw new TypeError(`Invalid rulebooks.yaml: expected a mapping with a "rulebooks:" key (in ${manifestPath})`);
  }

  const declared = parsed.rulebooks;
  if (declared === undefined || declared === null) {
    return [];
  }
  if (!Array.isArray(declared)) {
    throw new TypeError(`Invalid rulebooks.yaml: "rulebooks" must be a list (in ${manifestPath})`);
  }

  const slugs = declared.map((entry) => resolveEntrySlug(entry, manifestPath));
  return [...new Set(slugs)];
}

/** Extracts the slug from a declaration entry: a bare string (shorthand) or `{ name: <slug> }` (structured). */
function resolveEntrySlug(entry: unknown, manifestPath: string): string {
  if (typeof entry === 'string') {
    return entry;
  }
  if (isRecord(entry) && typeof entry.name === 'string') {
    return entry.name;
  }
  throw new Error(
    `Invalid rulebook entry in ${manifestPath}: expected a slug string or { name: <slug> }, got ${JSON.stringify(entry)}`,
  );
}

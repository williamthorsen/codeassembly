import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type Document, isMap, isScalar } from 'yaml';

import { kbRegistryFileSchema } from './kb-registry-schema.ts';
import { loadRegistryDocument } from './registry-document.ts';

/** The outcome of a registry write. */
export interface RegisterStoreResult {
  /** `added` when a new entry was written; `already-present` when an entry of the same name already existed. */
  status: 'added' | 'already-present';
}

/**
 * Inserts a knowledge-base entry under `kbs:` in a `kb.yaml` registry, creating the file and its parent directory when
 * absent and preserving any existing comments and formatting. Every write leaves the `kbs:` entries alphabetically
 * ordered, so a registry that has already drifted converges rather than merely staying sorted. An existing entry of the
 * same name is left untouched and reported as `already-present`; that path writes nothing, so re-registering never
 * reorders the file. The registry is validated against its schema both before mutation (so an already-corrupt file
 * throws rather than being silently extended) and after (so an invalid entry, such as an empty `storePath` from a
 * direct caller, throws rather than being written), never producing a corrupt file.
 */
export async function registerStore(input: {
  registryPath: string;
  name: string;
  storePath: string;
  description?: string;
}): Promise<RegisterStoreResult> {
  const doc = await loadRegistryDocument(input.registryPath);

  const existing = kbRegistryFileSchema.safeParse(doc.toJS() ?? {});
  if (!existing.success) {
    throw new Error(`${input.registryPath}: invalid kb.yaml — ${existing.error.issues[0]?.message ?? 'unknown error'}`);
  }

  if (doc.hasIn(['kbs', input.name])) {
    return { status: 'already-present' };
  }

  // The entry's own keys are written in alphabetical order, matching how the registry's entries are ordered.
  const entry: Record<string, string> = {
    ...(input.description !== undefined && { description: input.description }),
    path: input.storePath,
  };
  doc.setIn(['kbs', input.name], entry);
  sortRegistryEntries(doc);

  const result = kbRegistryFileSchema.safeParse(doc.toJS());
  if (!result.success) {
    throw new Error(
      `${input.registryPath}: cannot register "${input.name}" — ${result.error.issues[0]?.message ?? 'invalid entry'}`,
    );
  }

  await mkdir(dirname(input.registryPath), { recursive: true });
  await writeFile(input.registryPath, doc.toString(), 'utf8');
  return { status: 'added' };
}

// region | Helpers

/**
 * Compares two registry names case-insensitively, falling back to a case-sensitive comparison so that names differing
 * only in case still have a defined order rather than being treated as equal.
 */
function compareRegistryNames(left: string, right: string): number {
  const caseInsensitive = left.localeCompare(right, 'en', { sensitivity: 'base' });
  return caseInsensitive === 0 ? left.localeCompare(right) : caseInsensitive;
}

/**
 * Orders the `kbs:` entries alphabetically by name. Sorting the parsed nodes rather than an object rebuilt from `toJS`
 * is what preserves the document: a comment attached to an entry travels with it, and a comment preceding the first
 * entry belongs to the block itself and stays at its head.
 */
function sortRegistryEntries(doc: Document): void {
  const kbs = doc.getIn(['kbs'], true);
  if (!isMap(kbs)) {
    return;
  }
  kbs.items.sort((left, right) => compareRegistryNames(readName(left.key), readName(right.key)));
}

/**
 * Reads a registry entry's name from its key. A key parsed from the file arrives as a scalar node, while one just
 * written by `setIn` is held as a raw string, so both forms have to be read.
 */
function readName(key: unknown): string {
  if (isScalar(key)) {
    return String(key.value);
  }
  return typeof key === 'string' ? key : '';
}

// endregion | Helpers

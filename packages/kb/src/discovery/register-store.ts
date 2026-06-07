import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Document, parseDocument } from 'yaml';

import { isEnoent } from '../type-guards.ts';
import { kbRegistryFileSchema } from './kb-registry-schema.ts';

/** The outcome of a registry write. */
export interface RegisterStoreResult {
  /** `added` when a new entry was written; `already-present` when an entry of the same name already existed. */
  status: 'added' | 'already-present';
}

/**
 * Inserts a knowledge-base entry under `kbs:` in a `kb.yaml` registry, creating the file and its parent directory when
 * absent and preserving any existing comments and formatting. An existing entry of the same name is left untouched and
 * reported as `already-present`. The registry is validated against its schema both before mutation (so an
 * already-corrupt file throws rather than being silently extended) and after (so an invalid entry — e.g. an empty
 * `storePath` from a direct caller — throws rather than being written), never producing a corrupt file.
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

  const entry: Record<string, string> = { path: input.storePath };
  if (input.description !== undefined) {
    entry.description = input.description;
  }
  doc.setIn(['kbs', input.name], entry);

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

/** Reads and parses the registry as a `yaml` Document, returning a fresh empty document when the file is absent or empty. */
async function loadRegistryDocument(path: string): Promise<Document> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isEnoent(error)) {
      return new Document({});
    }
    throw error;
  }
  const doc = parseDocument(text);
  return doc.contents === null ? new Document({}) : doc;
}

// endregion | Helpers

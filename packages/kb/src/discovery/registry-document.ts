import { readFile } from 'node:fs/promises';

import { Document, parseDocument } from 'yaml';

import { isEnoent } from '../type-guards.ts';

/**
 * Reads and parses a `kb.yaml` registry as a `yaml` Document, returning a fresh empty document when the file is absent
 * or empty. Parsing through `parseDocument` preserves comments and formatting so registry writers can mutate in place
 * without discarding them. Shared by every registry writer (`registerStore`, `setDefaultKb`, `clearDefaultKb`).
 */
export async function loadRegistryDocument(path: string): Promise<Document> {
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

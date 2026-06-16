import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { type Document, isMap, isScalar } from 'yaml';

import { kbRegistryFileSchema } from './kb-registry-schema.ts';
import { loadRegistryDocument } from './registry-document.ts';

/**
 * Sets the top-level `default_kb` pointer in a `kb.yaml` registry to `name`, creating the file and its parent directory
 * when absent and preserving existing comments and formatting. Validates the registry against its schema before mutating
 * (so an already-corrupt file throws rather than being rewritten) and asserts `name` is registered under `kbs` in the
 * file (a `default_kb` naming no registered KB would fail every subsequent load), then re-validates the result.
 */
export async function setDefaultKb(input: { registryPath: string; name: string }): Promise<void> {
  const doc = await loadRegistryDocument(input.registryPath);

  const existing = kbRegistryFileSchema.safeParse(doc.toJS() ?? {});
  if (!existing.success) {
    throw new Error(`${input.registryPath}: invalid kb.yaml — ${existing.error.issues[0]?.message ?? 'unknown error'}`);
  }

  if (!doc.hasIn(['kbs', input.name])) {
    throw new Error(`${input.registryPath}: "${input.name}" is not a registered knowledge base`);
  }

  doc.set('default_kb', input.name);

  const result = kbRegistryFileSchema.safeParse(doc.toJS());
  if (!result.success) {
    throw new Error(
      `${input.registryPath}: cannot set default_kb — ${result.error.issues[0]?.message ?? 'invalid registry'}`,
    );
  }

  await mkdir(dirname(input.registryPath), { recursive: true });
  await writeFile(input.registryPath, doc.toString(), 'utf8');
}

/**
 * Removes the top-level `default_kb` pointer from a `kb.yaml` registry, preserving existing comments and formatting. A
 * no-op when no default is set (or the file is absent): the file is left untouched rather than rewritten, so clearing is
 * idempotent and never reformats. Validates an existing registry against its schema first, so a corrupt file throws
 * rather than being rewritten.
 */
export async function clearDefaultKb(input: { registryPath: string }): Promise<void> {
  const doc = await loadRegistryDocument(input.registryPath);

  const existing = kbRegistryFileSchema.safeParse(doc.toJS() ?? {});
  if (!existing.success) {
    throw new Error(`${input.registryPath}: invalid kb.yaml — ${existing.error.issues[0]?.message ?? 'unknown error'}`);
  }

  if (!doc.has('default_kb')) {
    return;
  }

  deleteDefaultKb(doc);
  await writeFile(input.registryPath, doc.toString(), 'utf8');
}

// region | Helpers

/**
 * Deletes the `default_kb` pair, carrying any comment that preceded it onto the following key. A comment above
 * `default_kb` when it is the first key (e.g. a file header) belongs to whatever leads the file next, so it must not
 * vanish with the deleted pair; a comment above a trailing `default_kb` annotates it and is removed with it.
 */
function deleteDefaultKb(doc: Document): void {
  const map = doc.contents;
  if (!isMap(map)) {
    doc.delete('default_kb');
    return;
  }

  const index = map.items.findIndex((pair) => isScalar(pair.key) && pair.key.value === 'default_kb');
  const removed = index !== -1 ? map.items[index] : undefined;
  const carried = removed !== undefined && isScalar(removed.key) ? removed.key.commentBefore : undefined;

  doc.delete('default_kb');

  if (carried === undefined) {
    return;
  }
  const successor = map.items[index];
  if (successor !== undefined && isScalar(successor.key)) {
    successor.key.commentBefore =
      successor.key.commentBefore !== undefined ? `${carried}\n${successor.key.commentBefore}` : carried;
  }
}

// endregion | Helpers

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { writeIfChanged } from './fs-helpers.ts';
import type { RenderedSkillEntry } from './skill-transform.ts';
import { isEnoent } from './type-guards.ts';

/**
 * Materializes a rendered entry tree into `destDir`: Markdown entries are written from their transformed text, assets
 * are copied verbatim from source.
 *
 * The write is byte-stable, so re-deploying unchanged content makes no filesystem change: unchanged files are left
 * untouched, and destination files the source no longer carries — along with any directory left empty by their
 * removal — are pruned. Callers wanting a marker or any other per-file transform apply it to the entries first, so
 * this stays the one place a rendered tree meets the filesystem.
 */
export async function writeRenderedTree(destDir: string, entries: ReadonlyArray<RenderedSkillEntry>): Promise<void> {
  await mkdir(destDir, { recursive: true });
  await pruneOrphans(destDir, '', new Set(entries.map((entry) => entry.relPath)));

  for (const entry of entries) {
    const destPath = path.join(destDir, entry.relPath);
    await mkdir(path.dirname(destPath), { recursive: true });
    await (entry.kind === 'markdown'
      ? writeIfChanged(destPath, entry.content)
      : copyFileIfChanged(entry.srcPath, destPath));
  }
}

// region | Helpers

/** Copies `srcPath` to `destPath` only when the bytes differ, so that unchanged files are left untouched. */
async function copyFileIfChanged(srcPath: string, destPath: string): Promise<void> {
  const desired = await readFile(srcPath);
  const current = await readFileOrUndefined(destPath);
  if (current?.equals(desired)) {
    return;
  }
  await writeFile(destPath, desired);
}

/**
 * Removes every destination file absent from `expectedFiles`, then any directory left empty by those removals, so
 * dropped files — and the directories that held them — do not linger across re-deploys.
 */
async function pruneOrphans(destDir: string, relDir: string, expectedFiles: ReadonlySet<string>): Promise<void> {
  const entries = await readdir(path.join(destDir, relDir), { withFileTypes: true });
  for (const entry of entries) {
    const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    const absPath = path.join(destDir, rel);
    if (entry.isDirectory()) {
      await pruneOrphans(destDir, rel, expectedFiles);
      if ((await readdir(absPath)).length === 0) {
        await rm(absPath, { recursive: true, force: true });
      }
    } else if (!expectedFiles.has(rel)) {
      await rm(absPath, { force: true });
    }
  }
}

/** Reads a file as a buffer, returning `undefined` when it does not exist. */
async function readFileOrUndefined(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return;
    }
    throw error;
  }
}

// endregion | Helpers

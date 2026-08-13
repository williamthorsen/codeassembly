import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ALIASES_FILE, CONFIG_FILE, resolveKbDir, TAXONOMY_FILE } from '../layout/index.ts';
import type { KbRoot } from '../types.ts';
import { makeTempDir } from './make-temp-dir.ts';

/** Wraps a filesystem path as a `KbRoot`, performing no I/O. */
export function kbRootAt(path: string): KbRoot {
  return { path, kbDir: resolveKbDir(path) };
}

/** Stands up a temp KB root with an initialized `.kb/`, writes any supplied seed files into it, and returns its `KbRoot`. */
export async function makeKbRoot(
  seeds: { aliases?: string; config?: string; taxonomy?: string } = {},
): Promise<KbRoot> {
  const path = await makeTempDir('kb-root-');
  await mkdir(resolveKbDir(path), { recursive: true });
  if (seeds.aliases !== undefined) await writeFile(join(path, ALIASES_FILE), seeds.aliases, 'utf8');
  if (seeds.config !== undefined) await writeFile(join(path, CONFIG_FILE), seeds.config, 'utf8');
  if (seeds.taxonomy !== undefined) await writeFile(join(path, TAXONOMY_FILE), seeds.taxonomy, 'utf8');
  return kbRootAt(path);
}

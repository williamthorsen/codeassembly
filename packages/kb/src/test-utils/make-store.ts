import { mkdir } from 'node:fs/promises';

import { resolveKbDir } from '../layout/index.ts';
import { makeTempDir } from './make-temp-dir.ts';
import { writeFiles } from './write-files.ts';

/** Stands up a temp store with an initialized `.kb/` and the given `relativePath → content` files; returns its path. */
export async function makeStore(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir('kb-store-');
  await mkdir(resolveKbDir(root), { recursive: true });
  await writeFiles(root, files);
  return root;
}

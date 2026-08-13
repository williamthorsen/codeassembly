import { makeTempDir } from './make-temp-dir.ts';
import { writeFiles } from './write-files.ts';

/** Stands up a temp directory populated with the given `relativePath → content` files (no `.kb/`); returns its path. */
export async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await makeTempDir('kb-tree-');
  await writeFiles(root, files);
  return root;
}

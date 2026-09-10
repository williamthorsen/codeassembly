import { listMarkdownFilesRecursively } from '../../src/lib/fs-helpers.ts';

/** Lists every authored Markdown file under a root, skipping the test tree. */
export async function listMarkdownFiles(root: string): Promise<ReadonlyArray<string>> {
  return await listMarkdownFilesRecursively(root);
}

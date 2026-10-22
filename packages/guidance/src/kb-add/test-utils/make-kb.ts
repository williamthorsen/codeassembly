import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Builds a temp KB rooted at a fresh directory with a `.kb/` marker. */
export async function makeKb(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kb-add-cli-'));
  await mkdir(join(root, '.kb'), { recursive: true });
  return root;
}

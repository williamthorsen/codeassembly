import { readFile, writeFile } from 'node:fs/promises';

import { isEnoent } from './type-guards.ts';

/** Reads a file as UTF-8, returning an empty string when it does not exist. */
export async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return '';
    }
    throw error;
  }
}

/** Writes `content` to `filePath` only when it differs from the current contents, keeping re-runs diff-free. */
export async function writeIfChanged(filePath: string, content: string): Promise<void> {
  if ((await readFileOrEmpty(filePath)) === content) {
    return;
  }
  await writeFile(filePath, content, 'utf8');
}

import { randomBytes } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';

import { resolveEventPath, resolveEventsDir } from '@williamthorsen/kb/layout';

/**
 * Writes a new event record to the store's events directory.
 *
 * The content is staged in a same-directory temp file and committed with an exclusive hard `link`, so a kill mid-write
 * cannot leave a partial file at the destination. Linking onto an id that a record already holds fails with `EEXIST`,
 * which keeps a fresh capture from overwriting an existing event.
 */
export async function writeEvent(input: { storePath: string; id: string; content: string }): Promise<string> {
  await mkdir(resolveEventsDir(input.storePath), { recursive: true });

  const targetPath = resolveEventPath({ storePath: input.storePath, id: input.id });
  const tempPath = `${targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await link(tempPath, targetPath);
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // A temp file left behind is not worth masking the link outcome the caller is waiting on.
    }
  }

  return targetPath;
}

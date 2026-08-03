import { randomBytes } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';

import { resolveEventPath, resolveEventsDir } from '@williamthorsen/kb/layout';

/**
 * Writes a new event record to the store's events directory, creating that directory with `mkdir -p` semantics when
 * absent. The content is staged in a same-directory temp file and committed with an exclusive hard
 * `link`, so the write is both crash-safe (a kill mid-write cannot leave a partial file at the destination) and
 * collision-safe: linking fails with `EEXIST` when a record already occupies the id, surfacing a clash rather than
 * silently overwriting. ULID keys make a clash practically impossible, but a fresh capture must never overwrite an
 * existing event, so the guarantee is enforced rather than assumed. Amending an existing event overwrites it through the
 * shared note writer, not this function. The temp file is removed whether the link succeeds or fails.
 */
export async function writeEvent(input: { storePath: string; id: string; content: string }): Promise<string> {
  await mkdir(resolveEventsDir(input.storePath), { recursive: true });

  const targetPath = resolveEventPath({ storePath: input.storePath, id: input.id });
  const tempPath = `${targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await link(tempPath, targetPath);
  } finally {
    await unlink(tempPath).catch(() => {});
  }

  return targetPath;
}

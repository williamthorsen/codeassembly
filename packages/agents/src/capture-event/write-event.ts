import { randomBytes } from 'node:crypto';
import { link, mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Writes an event record to `{storePath}/events/{id}.md`, creating `events/` with `mkdir -p` semantics when absent.
 * The content is staged in a same-directory temp file and committed with an exclusive hard `link`, so the write is
 * both crash-safe (a kill mid-write cannot leave a partial file at the destination) and immutable: linking fails with
 * `EEXIST` when a record already occupies the id, surfacing a collision rather than silently overwriting an existing
 * event. ULID keys make a collision practically impossible, but the store is append-only, so the guarantee is
 * enforced rather than assumed. The temp file is removed whether the link succeeds or fails.
 */
export async function writeEvent(input: { storePath: string; id: string; content: string }): Promise<string> {
  const targetDir = join(input.storePath, 'events');
  await mkdir(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${input.id}.md`);
  const tempPath = `${targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await link(tempPath, targetPath);
  } finally {
    await unlink(tempPath).catch(() => {});
  }

  return targetPath;
}

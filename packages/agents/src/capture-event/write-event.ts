import { randomBytes } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Writes an event record to `{storePath}/events/{id}.md` atomically. The `events/` directory is created with
 * `mkdir -p` semantics when absent. The write goes through a same-directory temp file plus `rename`, so a process kill
 * mid-write cannot leave a partial file at the destination.
 *
 * No collision-merge branch exists: ULID keys are unique at capture cadence, so the destination is treated as fresh.
 * A `rename` failure (permission, disk) propagates to the caller after a best-effort temp-file cleanup.
 */
export async function writeEvent(input: { storePath: string; id: string; content: string }): Promise<string> {
  const targetDir = join(input.storePath, 'events');
  await mkdir(targetDir, { recursive: true });

  const targetPath = join(targetDir, `${input.id}.md`);
  const tempPath = `${targetPath}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, input.content, 'utf8');
  try {
    await rename(tempPath, targetPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }

  return targetPath;
}

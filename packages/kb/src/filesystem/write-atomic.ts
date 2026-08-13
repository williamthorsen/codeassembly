import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Atomically writes `content` to `path` via a temp file plus `rename`, so a concurrent reader never sees a partial
 * write. The temp file is a sibling of the target, keeping the rename within one filesystem, where it is atomic. On
 * rename failure the temp file is cleaned up best-effort and the error re-thrown.
 */
export async function writeAtomic(path: string, content: string): Promise<void> {
  const tempPath = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  await writeFile(tempPath, content, 'utf8');
  try {
    await rename(tempPath, path);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // The rename failure is what the caller needs; a failed cleanup must not mask it.
    }
    throw error;
  }
}

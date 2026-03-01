import { existsSync, lstatSync } from 'node:fs';
import { cp, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Checks whether a directory path is a symlink. Throws with a user-readable
 * error if it is, directing the user to resolve it before installing.
 */
export function checkSymlinkSafety(dirPath: string): void {
  if (!existsSync(dirPath)) {
    return;
  }

  const stats = lstatSync(dirPath);
  if (stats.isSymbolicLink()) {
    throw new Error(
      `Target directory is a symlink: ${dirPath}\n` +
        'The install command cannot write into a symlinked directory.\n' +
        'Please remove the symlink and re-run the install command.',
    );
  }
}

/**
 * Copies a file or directory recursively.
 * @param src Absolute source path.
 * @param dest Absolute destination path.
 */
export async function copyItem(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
}

/**
 * Creates a relative symlink from dest pointing to src.
 * @param src Absolute source path.
 * @param dest Absolute destination path.
 */
export async function linkItem(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });

  // Remove existing entry at dest if present
  if (existsSync(dest)) {
    const stats = await lstat(dest);
    if (stats.isSymbolicLink()) {
      const currentTarget = await readlink(dest);
      const expectedTarget = path.relative(path.dirname(dest), src);
      if (currentTarget === expectedTarget) {
        return; // Already linked correctly
      }
    }
    await rm(dest, { recursive: true, force: true });
  }

  const relativeSrc = path.relative(path.dirname(dest), src);
  await symlink(relativeSrc, dest);
}

/**
 * Removes a file or directory.
 * @param destPath Absolute path to remove.
 */
export async function removeItem(destPath: string): Promise<void> {
  if (existsSync(destPath)) {
    await rm(destPath, { recursive: true, force: true });
  }
}

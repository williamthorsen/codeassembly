import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { cp, lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises';
import path from 'node:path';

/** Checks whether a directory path is a symlink, throwing a message that names what to resolve before installing. */
export function checkSymlinkSafety(dirPath: string): void {
  if (!existsSync(dirPath)) {
    return;
  }

  const stats = lstatSync(dirPath);
  if (stats.isSymbolicLink()) {
    const lines = [
      `Target directory is a symlink: ${dirPath}`,
      'The install command cannot write into a symlinked directory.',
    ];

    try {
      const entries = readdirSync(dirPath);
      if (entries.length > 0) {
        const MAX_LISTED = 5;
        lines.push('The target directory contains files that may need to be preserved:');
        for (const entry of entries.slice(0, MAX_LISTED)) {
          lines.push(`  ${entry}`);
        }
        if (entries.length > MAX_LISTED) {
          lines.push(`  ... and ${entries.length - MAX_LISTED} more`);
        }
      }
    } catch {
      // Fall back to warning without file list if the directory can't be read.
    }

    lines.push(
      'Remove the symlink, recreate it as a regular directory, restore',
      'any preserved files, and re-run the install command.',
    );

    throw new Error(lines.join('\n'));
  }
}

/** Returns true for OS metadata files like .DS_Store that should never be installed. */
function isDotfile(filePath: string): boolean {
  return path.basename(filePath).startsWith('.');
}

/** Copies a file or directory recursively, excluding dotfiles (e.g., .DS_Store). Both paths are absolute. */
export async function copyItem(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, {
    recursive: true,
    filter: (source) => !isDotfile(source),
  });
}

/** Creates a relative symlink at `dest` pointing to `src`. Both paths are absolute. */
export async function linkItem(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });

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
 * Removes an existing symlink at the destination, so that a later write creates a real file instead of writing
 * through the link into an unrelated directory (e.g. a dotfiles repo).
 */
export async function unlinkIfSymlink(destPath: string): Promise<void> {
  if (!existsSync(destPath)) {
    return;
  }
  const stats = lstatSync(destPath);
  if (stats.isSymbolicLink()) {
    await rm(destPath);
  }
}

/**
 * Removes a file, directory, or symlink. A dangling symlink (its target gone) is still removed, because `rm`
 * operates on the link itself; `force` makes removal a no-op when the path is absent.
 */
export async function removeItem(destPath: string): Promise<void> {
  await rm(destPath, { recursive: true, force: true });
}

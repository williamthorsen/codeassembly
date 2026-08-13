import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Writes each `relativePath → content` entry beneath `root`, creating parent directories as needed. */
export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const full = join(root, relativePath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
}

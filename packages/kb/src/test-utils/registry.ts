import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { makeTempDir } from './make-temp-dir.ts';

/** Returns the user-global `kb.yaml` registry path for an injected home directory. */
export function getRegistryPathFor(home: string): string {
  return join(home, '.agents', 'kb.yaml');
}

/** Creates a temp directory and returns an as-yet-uncreated `.agents/kb.yaml` path beneath it. */
export async function makeRegistryPath(): Promise<string> {
  return getRegistryPathFor(await makeTempDir('kb-registry-'));
}

/** Writes seed content to a registry path, creating its parent `.agents/` directory first. */
export async function seedRegistry(registryPath: string, content: string): Promise<void> {
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, content, 'utf8');
}

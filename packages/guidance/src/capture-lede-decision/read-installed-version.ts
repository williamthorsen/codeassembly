import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { isEnoent, isRecord } from '../lib/type-guards.ts';

/**
 * Reads the version of the `codeassembly` build that last wrote the home domain, from the home-provenance stamp at
 * `provenancePath`, or at `~/.codeassembly/home-provenance.json` under `home` when that is omitted. Yields `null` when
 * the stamp is missing, unparseable, or does not record a write. The stamp's format is documented by `codeassembly`
 * under "Home-domain provenance".
 */
export async function readInstalledVersion(input: {
  provenancePath?: string | undefined;
  home?: string | undefined;
}): Promise<string | null> {
  const stampPath = input.provenancePath ?? path.join(input.home ?? homedir(), '.codeassembly', 'home-provenance.json');
  let raw: string;
  try {
    raw = await readFile(stampPath, 'utf8');
  } catch (error: unknown) {
    if (isEnoent(error)) return null;
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.schemaVersion !== 'number') {
    return null;
  }
  // A stamp predating `lastWrite` keeps the write fields at its top level.
  const write = isRecord(parsed.lastWrite) ? parsed.lastWrite : parsed;
  return typeof write.version === 'string' ? write.version : null;
}

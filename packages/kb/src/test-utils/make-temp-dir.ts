import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates a fresh empty temp directory with the given prefix. */
export async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

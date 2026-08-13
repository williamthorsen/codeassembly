import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Builds a fixture reader bound to `dir`; the returned function reads `dir/name` as UTF-8 text. */
export function makeReadFixture(dir: string): (name: string) => Promise<string> {
  return (name) => readFile(join(dir, name), 'utf8');
}

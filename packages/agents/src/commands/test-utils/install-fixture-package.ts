import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes a minimal `package.json` for `name` into the `node_modules` of the project at `projectDir`. */
export async function installFixturePackage(projectDir: string, name: string, version: string): Promise<void> {
  const packageDir = path.join(projectDir, 'node_modules', name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }), 'utf8');
}

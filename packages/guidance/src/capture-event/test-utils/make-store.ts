import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STORE_CONFIG = `targets:
  - 'content/**/*.md'
exclude:
  - '**/node_modules/**'
`;

/** Creates a temp event store plus an isolated home that registers it under `name` and marks it `default_kb`. */
export async function makeStore(name: string): Promise<{ storePath: string; home: string }> {
  const storePath = await makeStoreDir();

  const home = await mkdtemp(join(tmpdir(), 'capture-cli-home-'));
  await mkdir(join(home, '.agents'), { recursive: true });
  await writeFile(
    join(home, '.agents', 'kb.yaml'),
    `default_kb: ${name}\nkbs:\n  ${name}:\n    path: ${storePath}\n`,
    'utf8',
  );

  return { storePath, home };
}

/** Creates a temp event store directory containing a default `.kb/config.yaml`, returning its path. */
export async function makeStoreDir(): Promise<string> {
  const storePath = await mkdtemp(join(tmpdir(), 'capture-cli-store-'));
  await mkdir(join(storePath, '.kb'), { recursive: true });
  await writeFile(join(storePath, '.kb', 'config.yaml'), STORE_CONFIG, 'utf8');
  return storePath;
}

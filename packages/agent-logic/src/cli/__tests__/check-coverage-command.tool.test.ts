import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BIN_ENTRY = path.join(import.meta.dirname, '../index.ts');
const PROMPT = 'Greet the user.\n\nThen finish.';

describe('agent-logic check-coverage', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'check-coverage-cli-'));
    await writeFile(path.join(root, 'greeter.md'), PROMPT);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('exits 0 when every block is mapped', async () => {
    const { status } = await runCheck(root, [
      { quote: 'Greet the user', element: 'greeting' },
      { quote: 'Then finish', element: 'none' },
    ]);

    expect(status).toBe(0);
  });

  it('exits 1 and prints each unmapped block and quote problem on its own line', async () => {
    const { status, stdout } = await runCheck(root, [{ quote: 'Wave', element: 'greeting' }]);

    expect(status).toBe(1);
    expect(stdout.trim().split('\n')).toStrictEqual([
      'map[0]: "Wave" occurs 0 times',
      'line 1: Greet the user.',
      'line 3: Then finish.',
    ]);
  });

  it('exits 1 and prints the schema problems of a map of the wrong shape', async () => {
    const { status, stdout } = await runCheck(root, [{ quote: 'Greet' }]);

    expect(status).toBe(1);
    expect(stdout).toContain('map[0].element:');
  });

  it('exits 2 when the map file does not exist', () => {
    const { status } = spawnSync(process.execPath, [
      BIN_ENTRY,
      'check-coverage',
      path.join(root, 'greeter.md'),
      path.join(root, 'nope'),
    ]);

    expect(status).toBe(2);
  });
});

// region | Helpers
/** Writes the map and runs the command on it in `root`; returns its exit status and stdout. */
async function runCheck(root: string, map: unknown): Promise<{ status: number | null; stdout: string }> {
  const mapPath = path.join(root, 'map.json');
  await writeFile(mapPath, JSON.stringify(map));
  const { status, stdout } = spawnSync(
    process.execPath,
    [BIN_ENTRY, 'check-coverage', path.join(root, 'greeter.md'), mapPath],
    {
      encoding: 'utf8',
    },
  );
  return { status, stdout };
}
// endregion | Helpers

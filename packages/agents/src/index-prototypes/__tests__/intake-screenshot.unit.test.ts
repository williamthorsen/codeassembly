import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { intakeScreenshot } from '../intake-screenshot.ts';
import { buildPng } from '../test-utils/build-png.ts';

describe(intakeScreenshot, () => {
  it('stores the capture unchanged in the shots directory under its slug and version', async () => {
    const original = buildPng(1_280, 8);
    const { setDir, sourcePath } = await makeCapture(original);

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'dense', version: 2 });

    expect(result).toEqual({ ok: true, shot: path.join('shots', 'dense-v2.png') });
    expect(await readFile(path.join(setDir, 'shots', 'dense-v2.png'))).toEqual(original);
  });

  it('refuses a file that is not a PNG', async () => {
    const { setDir, sourcePath } = await makeCapture(Buffer.from('GIF89a, not a PNG'));

    await expect(intakeScreenshot({ sourcePath, setDir, slug: 'a', version: 1 })).resolves.toMatchObject({
      ok: false,
      error: 'not-png',
    });
  });

  it('refuses a missing file', async () => {
    const setDir = await mkdtemp(path.join(tmpdir(), 'index-prototypes-intake-'));

    await expect(
      intakeScreenshot({ sourcePath: path.join(setDir, 'absent.png'), setDir, slug: 'a', version: 1 }),
    ).resolves.toMatchObject({ ok: false, error: 'screenshot-not-found' });
  });
});

// region | Helpers

/** Writes `bytes` as a capture beside a fresh set directory. */
async function makeCapture(bytes: Buffer): Promise<{ setDir: string; sourcePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'index-prototypes-intake-'));
  const sourcePath = path.join(root, 'capture.png');
  await writeFile(sourcePath, bytes);
  return { setDir: path.join(root, 'set'), sourcePath };
}

// endregion | Helpers

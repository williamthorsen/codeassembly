import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type CommandRunner, intakeScreenshot } from '../intake-screenshot.ts';
import { buildPng } from '../test-utils/build-png.ts';

describe(intakeScreenshot, () => {
  it('downsizes a wide capture through sips into the shots directory', async () => {
    const { setDir, sourcePath } = await makeCapture(buildPng(1_280, 4));
    const calls: (readonly string[])[] = [];
    const runner: CommandRunner = async (argv) => {
      calls.push(argv);
      await writeFile(argv[4] ?? '', buildPng(640, 2));
      return { status: 0, stderr: '' };
    };

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'dense', version: 2, runner });

    const target = path.join(setDir, 'shots', 'dense-v2.png');
    expect(result).toEqual({ ok: true, shot: path.join('shots', 'dense-v2.png'), downsized: true });
    expect(calls).toEqual([['sips', '--resampleWidth', '640', '--out', target, sourcePath]]);
  });

  it('copies a capture that is already narrow enough without running sips', async () => {
    const original = buildPng(600, 2);
    const { setDir, sourcePath } = await makeCapture(original);
    const runner: CommandRunner = () => Promise.reject(new Error('sips should not run'));

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'a', version: 1, runner });

    expect(result).toEqual({ ok: true, shot: path.join('shots', 'a-v1.png'), downsized: false });
    expect(await readFile(path.join(setDir, 'shots', 'a-v1.png'))).toEqual(original);
  });

  it('copies the original and reports it when sips is not available', async () => {
    const original = buildPng(1_280, 2);
    const { setDir, sourcePath } = await makeCapture(original);
    const runner: CommandRunner = () => Promise.resolve({ status: null, stderr: '' });

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'a', version: 1, runner });

    expect(result).toMatchObject({
      ok: true,
      downsized: false,
      warning: expect.stringMatching(/sips is not available/),
    });
    expect(await readFile(path.join(setDir, 'shots', 'a-v1.png'))).toEqual(original);
  });

  it('copies the original and reports the stderr when sips fails', async () => {
    const { setDir, sourcePath } = await makeCapture(buildPng(1_280, 2));
    const runner: CommandRunner = () => Promise.resolve({ status: 13, stderr: 'Error: bad image\n' });

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'a', version: 1, runner });

    expect(result).toMatchObject({
      ok: true,
      downsized: false,
      warning: expect.stringMatching(/sips exited 13: Error: bad image;/),
    });
  });

  it('refuses a file that is not a PNG', async () => {
    const { setDir, sourcePath } = await makeCapture(Buffer.from('ÿØÿ jpeg-ish bytes padding padding'));

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

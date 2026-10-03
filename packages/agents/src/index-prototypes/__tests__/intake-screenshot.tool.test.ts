import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { intakeScreenshot, SHOT_WIDTH } from '../intake-screenshot.ts';
import { buildPng } from '../test-utils/build-png.ts';

const hasSips = spawnSync('sips', ['--help']).error === undefined;

describe(intakeScreenshot, () => {
  it.skipIf(!hasSips)('downsizes a wide capture to the shot width with the real sips', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'index-prototypes-sips-'));
    const sourcePath = path.join(root, 'capture.png');
    await writeFile(sourcePath, buildPng(1_280, 800));
    const setDir = path.join(root, 'set');

    const result = await intakeScreenshot({ sourcePath, setDir, slug: 'a', version: 1 });

    expect(result).toEqual({ ok: true, shot: path.join('shots', 'a-v1.png'), downsized: true });
    const stored = await readFile(path.join(setDir, 'shots', 'a-v1.png'));
    expect(stored.readUInt32BE(16)).toBe(SHOT_WIDTH);
    expect(stored.readUInt32BE(20)).toBe(400);
  });
});

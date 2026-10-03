import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent } from '../lib/type-guards.ts';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The outcome of taking a screenshot into the set directory. */
export type IntakeResult =
  { ok: true; shot: string } | { ok: false; error: 'not-png' | 'screenshot-not-found'; message: string };

/** Stores a PNG capture as `shots/{slug}-v{version}.png` in the set directory, at its original size. */
export async function intakeScreenshot(input: {
  sourcePath: string;
  setDir: string;
  slug: string;
  version: number;
}): Promise<IntakeResult> {
  let bytes: Buffer;
  try {
    bytes = await readFile(input.sourcePath);
  } catch (error) {
    if (isEnoent(error)) {
      return { ok: false, error: 'screenshot-not-found', message: `no screenshot at ${input.sourcePath}` };
    }
    throw error;
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return { ok: false, error: 'not-png', message: `${input.sourcePath} is not a PNG file` };
  }

  const shot = path.join('shots', `${input.slug}-v${input.version}.png`);
  const targetPath = path.join(input.setDir, shot);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await copyFile(input.sourcePath, targetPath);
  return { ok: true, shot };
}

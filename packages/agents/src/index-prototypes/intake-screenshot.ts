import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isEnoent, isRecord } from '../lib/type-guards.ts';

/** The width, in pixels, to which a wider screenshot is downsized. */
export const SHOT_WIDTH = 640;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Runs a command; `status` is `null` when the command could not be started. */
export type CommandRunner = (argv: readonly string[]) => Promise<{ status: number | null; stderr: string }>;

/** The outcome of taking a screenshot into the set directory. */
export type IntakeResult =
  | { ok: true; shot: string; downsized: boolean; warning?: string }
  | { ok: false; error: 'not-png' | 'screenshot-not-found'; message: string };

/**
 * Stores a PNG capture as `shots/{slug}-v{version}.png` in the set directory, downsizing it through `sips` when it is
 * wider than `SHOT_WIDTH`. When `sips` cannot run or fails, stores the original and reports why in `warning`.
 */
export async function intakeScreenshot(input: {
  sourcePath: string;
  setDir: string;
  slug: string;
  version: number;
  runner?: CommandRunner;
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
  if (!isPng(bytes)) {
    return { ok: false, error: 'not-png', message: `${input.sourcePath} is not a PNG file` };
  }

  const shot = path.join('shots', `${input.slug}-v${input.version}.png`);
  const targetPath = path.join(input.setDir, shot);
  await mkdir(path.dirname(targetPath), { recursive: true });

  if (readPngWidth(bytes) <= SHOT_WIDTH) {
    await copyFile(input.sourcePath, targetPath);
    return { ok: true, shot, downsized: false };
  }

  const runner = input.runner ?? runCommand;
  const run = await runner(['sips', '--resampleWidth', String(SHOT_WIDTH), '--out', targetPath, input.sourcePath]);
  if (run.status === 0) {
    return { ok: true, shot, downsized: true };
  }

  await copyFile(input.sourcePath, targetPath);
  const reason =
    run.status === null ? 'sips is not available' : `sips exited ${run.status}: ${run.stderr.trim() || 'no output'}`;
  return { ok: true, shot, downsized: false, warning: `${reason}; stored the screenshot at its original size` };
}

// region | Helpers

/** Returns true when `bytes` starts with the PNG signature and is long enough to contain the header chunk. */
function isPng(bytes: Buffer): boolean {
  return bytes.length >= 24 && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

/** Reads the image width from a PNG's header chunk, which follows the signature at a fixed offset. */
function readPngWidth(bytes: Buffer): number {
  return bytes.readUInt32BE(16);
}

/** Runs a command through `execFile`, reporting a command that could not be started as status `null`. */
async function runCommand(argv: readonly string[]): Promise<{ status: number | null; stderr: string }> {
  const [file, ...args] = argv;
  if (file === undefined) {
    throw new Error('runCommand requires a command');
  }
  return new Promise((resolve) => {
    void execFile(file, args, (error, _stdout, stderr) => {
      if (error === null) {
        resolve({ status: 0, stderr });
        return;
      }
      if (isEnoent(error)) {
        resolve({ status: null, stderr });
        return;
      }
      const code = isRecord(error) && typeof error.code === 'number' ? error.code : 1;
      resolve({ status: code, stderr });
    });
  });
}

// endregion | Helpers

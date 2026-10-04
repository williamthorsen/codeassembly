import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

describe('resolve-review-run CLI', () => {
  let ticketDir: string;

  beforeEach(async () => {
    ticketDir = await mkdtemp(path.join(tmpdir(), 'resolve-review-run-'));
  });

  afterEach(async () => {
    await rm(ticketDir, { force: true, recursive: true });
  });

  it('prints a null active run as JSON when none exists', async () => {
    const result = await runCli(['active', '--ticket-dir', ticketDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ runDir: null });
  });

  it('prints the opened run directory as JSON, and reuses it on the next open', async () => {
    const expected = { runDir: path.join(ticketDir, '20261004-101500Z-interactive') };

    const first = await runCli(['open', '--ticket-dir', ticketDir, '--timestamp', '20261004-101500Z']);
    const second = await runCli(['open', '--ticket-dir', ticketDir, '--timestamp', '20261004-120000Z']);

    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toEqual(expected);
    expect(second.exitCode).toBe(0);
    expect(JSON.parse(second.stdout)).toEqual(expected);
  });

  it('prints the newest run and review as JSON', async () => {
    const runDir = path.join(ticketDir, '20261004-101500Z-interactive');
    await mkdir(runDir);
    await writeFile(path.join(runDir, '20261004-101500Z_reviewer_review.md'), '');

    const result = await runCli(['latest', '--ticket-dir', ticketDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      reviewPath: path.join(runDir, '20261004-101500Z_reviewer_review.md'),
      runDir,
    });
  });

  it('exits 1 with a message naming the directory when no run exists', async () => {
    const result = await runCli(['latest', '--ticket-dir', ticketDir]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`no interactive run directory found in ${ticketDir}`);
  });

  it.each([
    [['open', '--ticket-dir', '/tmp/x'], '--timestamp is required'],
    [['active', '--ticket-dir', '/tmp/x', '--timestamp', '20261004-101500Z'], 'active does not take --timestamp'],
    [['latest', '--ticket-dir', '/tmp/x', '--timestamp', '20261004-101500Z'], 'latest does not take --timestamp'],
    [['create', '--ticket-dir', '/tmp/x'], 'unknown command: create'],
    [[], 'usage: resolve-review-run'],
  ])('rejects %j', async (argv, message) => {
    const result = await runCli(argv);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message);
  });
});

// region | Helpers

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Runs the CLI source under node and reports its exit code and output. */
async function runCli(argv: readonly string[]): Promise<CliResult> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv]);
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (
      isRecord(error) &&
      typeof error.code === 'number' &&
      typeof error.stderr === 'string' &&
      typeof error.stdout === 'string'
    ) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

// endregion | Helpers

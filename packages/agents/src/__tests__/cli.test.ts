import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

interface ExecError {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** Type guard for child_process exec errors. */
function isExecError(error: unknown): error is ExecError {
  return typeof error === 'object' && error !== null && 'stdout' in error && 'stderr' in error && 'code' in error;
}

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Runs the CLI via tsx and captures stdout, stderr, and exit code. */
async function runCli(...args: Array<string>): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync('tsx', [CLI_PATH, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    if (isExecError(error)) {
      return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
    }
    throw error;
  }
}

describe('CLI generate routing', () => {
  it('exits 1 and prints generate usage when no subcommand is given', async () => {
    const result = await runCli('generate');

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('label-map');
  });

  it('exits 1 and prints error for unknown generate target', async () => {
    const result = await runCli('generate', 'nonexistent');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown generate target "nonexistent"');
  });
});

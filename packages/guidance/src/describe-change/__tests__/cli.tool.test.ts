import { execFile } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { SUBCOMMAND_NAMES } from '../test-utils/subcommand-names.ts';

/** The helper's source, which the running Node executes directly. */
const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

const execFileAsync = promisify(execFile);

describe('subcommand dispatch', () => {
  it('if the invocation omits a subcommand, exits non-zero and lists every subcommand on stderr', async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    for (const name of SUBCOMMAND_NAMES) {
      expect(result.stderr).toContain(name);
    }
  });

  it('if an unknown subcommand is passed, exits non-zero and lists every subcommand on stderr', async () => {
    const result = await runCli(['--scope', 'agents']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/^describe-change: unknown subcommand --scope; usage: /);
    for (const name of SUBCOMMAND_NAMES) {
      expect(result.stderr).toContain(name);
    }
  });
});

// region | Helpers

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Reports whether a thrown value is a failed child process with its output and exit code. */
function isExecError(error: unknown): error is { code: number; stderr: string; stdout: string } {
  return (
    isRecord(error) &&
    typeof error['code'] === 'number' &&
    typeof error['stderr'] === 'string' &&
    typeof error['stdout'] === 'string'
  );
}

/** Runs the helper's source under the running Node, capturing its output and exit code. */
async function runCli(argv: readonly string[]): Promise<CliResult> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv]);
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (isExecError(error)) {
      return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
    }
    throw error;
  }
}

// endregion | Helpers

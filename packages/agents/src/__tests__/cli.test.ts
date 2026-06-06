import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isRecord } from '../lib/type-guards.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = new URL('../cli.ts', import.meta.url).pathname;

interface ExecError {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

/** Type guard for child_process exec errors. */
function isExecError(error: unknown): error is ExecError {
  return (
    isRecord(error) &&
    typeof error.stdout === 'string' &&
    typeof error.stderr === 'string' &&
    typeof error.code === 'number'
  );
}

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Runs the CLI via tsx in an optional working directory, capturing stdout, stderr, and exit code. */
async function runCliIn(cwd: string | undefined, ...args: Array<string>): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync('tsx', [CLI_PATH, ...args], cwd === undefined ? {} : { cwd });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    if (isExecError(error)) {
      return { stdout: error.stdout, stderr: error.stderr, exitCode: error.code };
    }
    throw error;
  }
}

/** Runs the CLI via tsx in the default working directory. */
async function runCli(...args: Array<string>): Promise<CliResult> {
  return runCliIn(undefined, ...args);
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

describe('CLI rulebook routing', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = path.join(tmpdir(), `agents-test-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(projectRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('lists the init and sync commands in --help', async () => {
    const result = await runCli('--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('sync');
  });

  it('dispatches sync, reporting a no-op when no rulebooks.yaml exists', async () => {
    const result = await runCliIn(projectRoot, 'sync');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to sync');
  });

  it('dispatches init, scaffolding rulebooks.yaml in the project', async () => {
    const result = await runCliIn(projectRoot, 'init');

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(projectRoot, '.agents', 'rulebooks.yaml'))).toBe(true);
  });
});

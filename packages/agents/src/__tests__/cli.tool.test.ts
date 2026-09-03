import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
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

  it('dispatches sync, reporting a no-op when no codeassembly.yaml exists', async () => {
    const result = await runCliIn(projectRoot, 'sync');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Nothing to sync');
  });

  it('dispatches init, scaffolding codeassembly.yaml in the project', async () => {
    const result = await runCliIn(projectRoot, 'init');

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(projectRoot, '.agents', 'codeassembly.yaml'))).toBe(true);
  });
});

describe('CLI harness flag', () => {
  it('rejects an invalid --harness value', async () => {
    const result = await runCli('install', '--harness', 'bogus');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid harness "bogus"');
  });

  it('rejects the removed --platform flag as an unknown option', async () => {
    const result = await runCli('install', '--platform', 'claude');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option "--platform"');
  });

  it('documents --harness (not --platform) in --help', async () => {
    const result = await runCli('--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--harness');
    expect(result.stdout).not.toContain('--platform');
  });
});

describe('CLI sync --warn-only', () => {
  let projectRoot: string;

  // A declaration whose source path names a file rather than a directory fails `sync` before it writes anything,
  // which makes it the cheapest way to exercise the two failure postures against the same input.
  beforeEach(async () => {
    projectRoot = path.join(tmpdir(), `agents-test-warn-only-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await writeFile(path.join(projectRoot, '.agents', 'not-a-dir'), 'not a dir\n', 'utf8');
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.yaml'),
      'sources:\n  - name: bad-source\n    path: ./not-a-dir\n',
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('when a declared source is invalid, exits 1 and names the source', async () => {
    const result = await runCliIn(projectRoot, 'sync');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('bad-source');
  });

  it('when --warn-only is passed, exits 0 and says the previous guidance remains in effect', async () => {
    const result = await runCliIn(projectRoot, 'sync', '--warn-only');

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('bad-source');
    expect(result.stderr).toContain('Nothing was written');
    expect(result.stderr).toContain('previously deployed guidance remains in effect');
  });

  it('lists --warn-only in --help', async () => {
    const result = await runCli('--help');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--warn-only');
  });
});

describe('CLI sync failure reporting', () => {
  let projectRoot: string;
  let sourceDir: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    projectRoot = path.join(tmpdir(), `agents-test-sync-report-proj-${stamp}`);
    sourceDir = path.join(tmpdir(), `agents-test-sync-report-src-${stamp}`);
    await mkdir(path.join(projectRoot, '.agents'), { recursive: true });
    await mkdir(path.join(sourceDir, 'guidance', 'rulebooks'), { recursive: true });
    // Unquoted, `version` reaches the schema as a number and the rulebook is rejected: two of them, so one run has
    // more than one defect to report.
    for (const slug of ['alpha', 'beta']) {
      await writeFile(
        path.join(sourceDir, 'guidance', 'rulebooks', `${slug}.md`),
        `---\nslug: ${slug}\ndelivery: ambient\nversion: 1\n---\n\n# ${slug}\n\nGuidance.\n`,
        'utf8',
      );
    }
    await writeFile(
      path.join(projectRoot, '.agents', 'codeassembly.yaml'),
      `sources:\n  - name: org\n    path: ${sourceDir}\nrulebooks:\n  use:\n    - alpha\n    - beta\n`,
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it('reports every invalid rulebook in one run, grouped by file', async () => {
    const result = await runCliIn(projectRoot, 'sync', '--harness', 'claude');

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('sync found 2 defect(s)');
    expect(result.stderr).toContain('guidance/rulebooks/alpha.md');
    expect(result.stderr).toContain('guidance/rulebooks/beta.md');
  });

  it('renders the defect list as its own block rather than behind the `Error:` prefix', async () => {
    const result = await runCliIn(projectRoot, 'sync', '--harness', 'claude');

    expect(result.stderr).not.toMatch(/^Error:/m);
  });

  it('states that nothing was written and the previous guidance remains in effect', async () => {
    const result = await runCliIn(projectRoot, 'sync', '--harness', 'claude');

    expect(result.stderr).toContain('Nothing was written');
    expect(result.stderr).toContain('previously deployed guidance remains in effect');
    expect(existsSync(path.join(projectRoot, 'CLAUDE.local.md'))).toBe(false);
  });
});

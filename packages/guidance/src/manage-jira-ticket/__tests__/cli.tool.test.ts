import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isEnoent, isRecord } from '../../lib/type-guards.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

// An `acli` stand-in: It appends its argv, and the content of any `--description-file`, to the log as one JSON line.
const ACLI_STUB = String.raw`#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const fileIndex = args.indexOf('--description-file');
const description = fileIndex === -1 ? null : JSON.parse(fs.readFileSync(args[fileIndex + 1], 'utf8'));
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, description }) + '\n');
process.stdout.write(args[2] === 'create' ? '{"key":"ABC-7"}' : '');
`;

describe('manage-jira-ticket CLI', () => {
  let workDir: string;
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'manage-jira-ticket-'));
    projectDir = path.join(workDir, 'project');
    homeDir = path.join(workDir, 'home');
    await mkdir(path.join(projectDir, '.agents'), { recursive: true });
    await mkdir(homeDir);
    await execFileAsync('git', ['init', '--quiet', projectDir]);
    const acliPath = path.join(workDir, 'acli');
    await writeFile(acliPath, ACLI_STUB);
    await chmod(acliPath, 0o755);
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  it('creates the work item with the resolved target and an ADF description', async () => {
    await writePreferences('integrations:\n  jira:\n    project_key: ABC\n    issue_types:\n      bugfix: Bug\n');
    const bodyFile = await writeInput('body.md', '## Acceptance criteria\n\n- [ ] works\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ key: 'ABC-7', parentSkipped: false, rawOutput: '{"key":"ABC-7"}' });
    const calls = await readCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      args: expect.arrayContaining(['--project', 'ABC', '--type', 'Bug', '--summary', 'Fix it', '--json']),
      description: { type: 'doc', content: [{ type: 'heading' }, { type: 'taskList' }] },
    });
  });

  it('refuses an empty body without calling acli', async () => {
    await writePreferences('integrations:\n  jira:\n    project_key: ABC\n');
    const bodyFile = await writeInput('body.md', '');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Body file missing or empty: ${bodyFile}`);
    expect(await readCalls()).toEqual([]);
  });

  it('prints the fallback and exits non-zero without calling acli when no project key is configured', async () => {
    const bodyFile = await writeInput('body.md', 'Body\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toHaveProperty('fallback', 'no-project-key');
    expect(await readCalls()).toEqual([]);
  });

  it('resolves the target from the project prefix', async () => {
    await writePreferences('project:\n  ticket_ref_prefix: XYZ-\n');

    const result = await runCli(['resolve-target', '--work-type', 'feat']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ issueType: 'Task', projectKey: 'XYZ' });
  });

  it('ignores Jira settings in the global preferences file', async () => {
    await mkdir(path.join(homeDir, '.agents'));
    await writeFile(
      path.join(homeDir, '.agents', 'preferences.yaml'),
      'integrations:\n  jira:\n    project_key: GLOBAL\nproject:\n  ticket_ref_prefix: GLB-\n',
    );
    await writePreferences('project:\n  ticket_ref_prefix: XYZ-\n');

    const result = await runCli(['resolve-target', '--work-type', 'feat']);

    expect(JSON.parse(result.stdout)).toEqual({ issueType: 'Task', projectKey: 'XYZ' });
  });

  it('writes the converted body to the named path', async () => {
    const bodyFile = await writeInput('body.md', '- [x] done\n');
    const outFile = path.join(workDir, 'body.adf.json');

    const result = await runCli(['convert-body', '--body-file', bodyFile, '--out', outFile]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ adfPath: outFile });
    expect(JSON.parse(await readFile(outFile, 'utf8'))).toMatchObject({ content: [{ type: 'taskList' }] });
  });

  // region | Helpers

  /** Reads the calls that the `acli` stand-in recorded, in call order. */
  async function readCalls(): Promise<unknown[]> {
    let log: string;
    try {
      log = await readFile(path.join(workDir, 'calls.log'), 'utf8');
    } catch (error) {
      if (isEnoent(error)) {
        return [];
      }
      throw error;
    }
    return log
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line): unknown => JSON.parse(line));
  }

  /** Runs the helper's source from the project directory, with the `acli` stand-in first on `PATH`. */
  async function runCli(argv: readonly string[]): Promise<CliResult> {
    const env = {
      ...process.env,
      HOME: homeDir,
      PATH: `${workDir}${path.delimiter}${process.env.PATH ?? ''}`,
      STUB_LOG: path.join(workDir, 'calls.log'),
    };
    try {
      const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv], { cwd: projectDir, env });
      return { exitCode: 0, stderr, stdout };
    } catch (error) {
      if (isExecError(error)) {
        return { exitCode: error.code, stderr: error.stderr, stdout: error.stdout };
      }
      throw error;
    }
  }

  /** Writes an input file into the working directory and returns its absolute path. */
  async function writeInput(name: string, content: string): Promise<string> {
    const filePath = path.join(workDir, name);
    await writeFile(filePath, content);
    return filePath;
  }

  /** Writes the project's preferences file. */
  async function writePreferences(content: string): Promise<void> {
    await writeFile(path.join(projectDir, '.agents', 'preferences.yaml'), content);
  }

  // endregion | Helpers
});

// region | Helpers

interface CliResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

/** Returns true for the rejection that `execFile` produces when the child exits non-zero. */
function isExecError(error: unknown): error is CliResult & { code: number } {
  return (
    isRecord(error) &&
    typeof error.code === 'number' &&
    typeof error.stderr === 'string' &&
    typeof error.stdout === 'string'
  );
}

// endregion | Helpers

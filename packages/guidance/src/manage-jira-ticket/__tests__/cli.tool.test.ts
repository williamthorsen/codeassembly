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
// `auth status` reports `STUB_SITE` as the active site, or fails as an unauthenticated `acli` when it is unset.
const ACLI_STUB = String.raw`#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const fileIndex = args.indexOf('--description-file');
const description = fileIndex === -1 ? null : JSON.parse(fs.readFileSync(args[fileIndex + 1], 'utf8'));
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args, description }) + '\n');
if (args[1] === 'auth' && args[2] === 'status') {
  if (process.env.STUB_SITE) {
    process.stdout.write('✓ Authenticated\n  Site: ' + process.env.STUB_SITE + '\n  Email: user@example.com\n');
  } else {
    process.stderr.write("✗ Error: unauthorized: use 'acli jira auth login' to authenticate\n");
    process.exitCode = 1;
  }
} else {
  process.stdout.write(args[2] === 'create' ? '{"key":"ABC-7"}' : '');
}
`;

// A `git` stand-in: The CLI resolves its project root through `git -C <dir> rev-parse --show-toplevel`, for which the
// stand-in prints `STUB_GIT_TOPLEVEL`; it fails every other invocation.
const GIT_STUB = String.raw`#!${process.execPath}
const args = process.argv.slice(2);
if (args[0] === '-C' && args[2] === 'rev-parse' && args[3] === '--show-toplevel') {
  process.stdout.write(process.env.STUB_GIT_TOPLEVEL + '\n');
} else {
  process.stderr.write('git stub: unexpected invocation: ' + args.join(' ') + '\n');
  process.exitCode = 128;
}
`;

const SITE_PREFERENCES =
  'integrations:\n  jira:\n    project_key: ABC\nticket:\n  base_url: https://example.atlassian.net/browse/\n';

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
    await writeStub('acli', ACLI_STUB);
    await writeStub('git', GIT_STUB);
  });

  afterEach(async () => {
    await rm(workDir, { force: true, recursive: true });
  });

  it('creates the work item with the resolved target and an ADF description', async () => {
    await writePreferences('integrations:\n  jira:\n    project_key: ABC\n    issue_types:\n      bugfix: Bug\n');
    const bodyFile = await writeInput('body.md', '## Acceptance criteria\n\n- [ ] works\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      activeSite: null,
      key: 'ABC-7',
      parentSkipped: false,
      rawOutput: '{"key":"ABC-7"}',
    });
    const calls = await readCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      args: expect.arrayContaining(['--project', 'ABC', '--type', 'Bug', '--summary', 'Fix it', '--json']),
      description: { type: 'doc', content: [{ type: 'heading' }, { type: 'taskList' }] },
    });
  });

  it('creates once on the target site when the active site matches the base URL', async () => {
    await writePreferences(SITE_PREFERENCES);
    const bodyFile = await writeInput('body.md', 'Body\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix'], {
      STUB_SITE: 'example.atlassian.net',
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ activeSite: 'example.atlassian.net', key: 'ABC-7' });
    expect(await readSubcommands()).toEqual(['auth status', 'workitem create']);
  });

  it('refuses to create on another site without any other acli call', async () => {
    await writePreferences(SITE_PREFERENCES);
    const bodyFile = await writeInput('body.md', 'Body\n');

    const result = await runCli(
      ['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix', '--parent', 'ABC-1'],
      { STUB_SITE: 'other.atlassian.net' },
    );

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      activeSite: 'other.atlassian.net',
      fallback: 'wrong-site',
      targetSite: 'example.atlassian.net',
    });
    expect(result.stderr).toContain('acli jira auth switch --site example.atlassian.net');
    expect(await readSubcommands()).toEqual(['auth status']);
  });

  it('refuses to create when the active site cannot be read', async () => {
    await writePreferences(SITE_PREFERENCES);
    const bodyFile = await writeInput('body.md', 'Body\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ activeSite: null, fallback: 'site-unreadable' });
    expect(await readSubcommands()).toEqual(['auth status']);
  });

  it('refuses to create on another site when only the global preferences set the base URL', async () => {
    await writePreferences('integrations:\n  jira:\n    project_key: ABC\n');
    await writeGlobalPreferences('ticket:\n  base_url: https://example.atlassian.net/browse/\n');
    const bodyFile = await writeInput('body.md', 'Body\n');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix'], {
      STUB_SITE: 'other.atlassian.net',
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ fallback: 'wrong-site', targetSite: 'example.atlassian.net' });
    expect(await readSubcommands()).toEqual(['auth status']);
  });

  it('refuses an empty body without calling acli', async () => {
    await writePreferences('integrations:\n  jira:\n    project_key: ABC\n');
    const bodyFile = await writeInput('body.md', '');

    const result = await runCli(['create', '--summary', 'Fix it', '--body-file', bodyFile, '--work-type', 'fix']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`Body file missing or empty: ${bodyFile}`);
    expect(await readCalls()).toEqual([]);
  });

  it('prints the fallback and exits non-zero without calling acli when the preferences do not set a project key', async () => {
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
    // An empty stderr shows that the project root came from git rather than from the fallback's diagnostic.
    expect(result.stderr).toBe('');
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

  it('prints a match and exits zero when the active site is the target', async () => {
    const result = await runCli(['check-site', '--target', 'https://example.atlassian.net/browse/ABC-1'], {
      STUB_SITE: 'example.atlassian.net',
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      activeSite: 'example.atlassian.net',
      match: true,
      targetSite: 'example.atlassian.net',
    });
  });

  it('names both sites and the switch command when the active site is another', async () => {
    const result = await runCli(['check-site', '--target', 'example.atlassian.net'], {
      STUB_SITE: 'other.atlassian.net',
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toHaveProperty('match', false);
    expect(result.stderr).toContain(
      "acli's active site is other.atlassian.net, but the ticket is on example.atlassian.net",
    );
    expect(result.stderr).toContain('acli jira auth switch --site example.atlassian.net');
  });

  it('reports an unreadable active site when acli is not signed in', async () => {
    const result = await runCli(['check-site', '--target', 'example.atlassian.net']);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({
      activeSite: null,
      match: false,
      targetSite: 'example.atlassian.net',
    });
    expect(result.stderr).toContain("could not read acli's active site");
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

  /** Reads the `acli` subcommands that the stand-in recorded, such as `auth status`, in call order. */
  async function readSubcommands(): Promise<string[]> {
    const calls = await readCalls();
    return calls.map((call) => {
      if (!isRecord(call) || !Array.isArray(call['args'])) {
        throw new Error('unexpected stand-in log entry');
      }
      return call['args'].slice(1, 3).join(' ');
    });
  }

  /** Runs the helper's source from the project directory, with the `acli` and `git` stand-ins first on `PATH`. */
  async function runCli(argv: readonly string[], stubEnv: Readonly<Record<string, string>> = {}): Promise<CliResult> {
    const env = {
      ...process.env,
      ...stubEnv,
      HOME: homeDir,
      PATH: `${workDir}${path.delimiter}${process.env['PATH'] ?? ''}`,
      STUB_GIT_TOPLEVEL: projectDir,
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

  /** Writes the stand-in home directory's global preferences file. */
  async function writeGlobalPreferences(content: string): Promise<void> {
    await mkdir(path.join(homeDir, '.agents'), { recursive: true });
    await writeFile(path.join(homeDir, '.agents', 'preferences.yaml'), content);
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

  /** Writes an executable stand-in for a command into the directory that leads `PATH`. */
  async function writeStub(name: string, content: string): Promise<void> {
    const stubPath = path.join(workDir, name);
    await writeFile(stubPath, content);
    await chmod(stubPath, 0o755);
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
    typeof error['code'] === 'number' &&
    typeof error['stderr'] === 'string' &&
    typeof error['stdout'] === 'string'
  );
}

// endregion | Helpers

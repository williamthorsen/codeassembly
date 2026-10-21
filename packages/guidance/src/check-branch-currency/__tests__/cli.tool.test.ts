import { execFile } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isRecord } from '../../lib/type-guards.ts';
import { git, makeRemoteFixture, type RemoteFixture } from '../test-utils/make-remote-fixture.ts';

const execFileAsync = promisify(execFile);

const CLI_PATH = fileURLToPath(new URL('../cli.ts', import.meta.url));

describe('check-branch-currency CLI', () => {
  let fixture: RemoteFixture;

  beforeEach(() => {
    fixture = makeRemoteFixture();
  });

  afterEach(() => {
    fixture.remove();
  });

  it('prints the result as JSON, passing each --path to the check', async () => {
    git(fixture.upstream, 'commit', '--quiet', '--allow-empty', '--message', 'Upstream change');
    git(fixture.upstream, 'push', '--quiet', 'origin', 'main');

    const result = await runCli(['--base', 'origin/main', '--path', 'src', '--path', 'docs'], fixture.work);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      fetched: true,
      behind: 1,
      gained: [{ subject: 'Upstream change', touchesWork: false }],
    });
  });

  it('exits 0 with the error in the JSON when the fetch fails', async () => {
    const result = await runCli(['--base', 'nowhere/main'], fixture.work);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ fetched: false });
  });

  it.each([
    [[], '--base is required'],
    [['--base', 'main'], '--base must name a remote and a branch'],
    [['--base', 'origin/'], '--base must name a remote and a branch'],
    [['--base', 'origin/main', '--base', 'origin/dev'], '--base may be given only once'],
    [['--base', 'origin/main', 'extra'], 'unexpected argument: extra'],
  ])('rejects %j', async (argv, message) => {
    const result = await runCli(argv, fixture.work);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(message);
  });
});

// region | Helpers

/** Runs the CLI in `cwd` and returns its exit code and output, whether or not it fails. */
async function runCli(
  argv: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  try {
    const { stderr, stdout } = await execFileAsync(process.execPath, [CLI_PATH, ...argv], { cwd });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    if (!isRecord(error)) {
      throw error;
    }
    return {
      exitCode: typeof error['code'] === 'number' ? error['code'] : -1,
      stderr: typeof error['stderr'] === 'string' ? error['stderr'] : '',
      stdout: typeof error['stdout'] === 'string' ? error['stdout'] : '',
    };
  }
}

// endregion | Helpers

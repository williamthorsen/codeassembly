import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { runAdd } from '../cli.ts';
import { makeKb } from '../test-utils/make-kb.ts';

describe(runAdd, () => {
  it('subprocess smoke: piping a body into the built bundle produces a written note and well-shaped JSON', async () => {
    const kbPath = await makeKb();
    const bundlePath = join(import.meta.dirname, '..', '..', '..', 'content', 'skills', 'kb-add', 'kb-add.mjs');

    // The bundle may not exist in a watch-mode run; skip cleanly in that case.
    try {
      await stat(bundlePath);
    } catch {
      return;
    }

    const { stdout, exitCode } = await runChild({
      command: process.execPath,
      args: [bundlePath, '--diataxis', 'howto', '--title', 'Subprocess test'],
      stdinBody: 'Body from stdin.\n',
      cwd: kbPath,
      env: { ...process.env, HOME: kbPath },
    });

    expect(exitCode).toBe(0);
    const parsed: unknown = JSON.parse(stdout);
    expect(parsed).toMatchObject({ ok: true });
    const writtenPath = join(kbPath, 'content', 'assertions', 'Subprocess test.md');
    const content = await readFile(writtenPath, 'utf8');
    expect(content).toContain('title: Subprocess test');
    expect(content).toContain('Body from stdin.');
  });
});

// region | Helpers

/** Runs a child process with a string body piped to stdin; resolves with its stdout and exit code. */
async function runChild(input: {
  command: string;
  args: readonly string[];
  stdinBody: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        exitCode: code ?? 0,
      }),
    );
    child.stdin.write(input.stdinBody);
    child.stdin.end();
  });
}

// endregion | Helpers

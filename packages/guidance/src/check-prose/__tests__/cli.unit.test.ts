import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };
import { runCheckProse } from '../cli.ts';

const programName = 'check-prose';

describe(runCheckProse, () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'check-prose-cli-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('checks a file outside any repository and exits 1 with its candidates', async () => {
    const file = await writeBody('The fix will land soon.\n');
    using stdio = captureStdio();

    expect(await runCheckProse(['--file', file, '--json'], workDir, programName)).toBe(1);
    expect(JSON.parse(stdio.stdoutChunks.join(''))).toMatchObject({
      file,
      candidates: [{ rule: 'overused-word' }],
    });
    expect(stdio.stderrChunks.join('')).toBe('');
  });

  it('exits 0 when the file does not contain any candidate', async () => {
    const file = await writeBody('A plain sentence.\n');
    using stdio = captureStdio();

    expect(await runCheckProse(['--file', file], workDir, programName)).toBe(0);
    expect(stdio.stdoutChunks.join('')).toBe(`${file}: 0 candidate(s)\n`);
  });

  it('resolves a relative --file against the working directory', async () => {
    await writeBody('A plain sentence.\n');
    using stdio = captureStdio();

    expect(await runCheckProse(['--file', 'body.md', '--json'], workDir, programName)).toBe(0);
    expect(JSON.parse(stdio.stdoutChunks.join(''))).toMatchObject({ file: 'body.md', candidates: [] });
  });

  it('exits 2 and names the fix when the file cannot be read', async () => {
    using stdio = captureStdio();

    expect(await runCheckProse(['--file', 'missing.md'], workDir, programName)).toBe(2);
    expect(stdio.stderrChunks.join('')).toMatch(/^check-prose: cannot read missing\.md: .*pass a readable file/);
  });

  it.each([
    ['a missing --file', [], /--file <path> is required/],
    ['a positional argument', ['body.md'], /unexpected argument body\.md/],
    ['an unknown option', ['--jsn'], /unknown option --jsn; did you mean --json\?/],
  ])('exits 2 on %s', async (_label, argv, message) => {
    using stdio = captureStdio();

    expect(await runCheckProse(argv, workDir, programName)).toBe(2);
    expect(stdio.stderrChunks.join('')).toMatch(message);
    expect(stdio.stdoutChunks.join('')).toBe('');
  });

  it.each([['--help'], ['-h']])('prints help for %s before validating the arguments', async (flag) => {
    using stdio = captureStdio();

    expect(await runCheckProse([flag, '--bogus'], workDir, programName)).toBe(0);
    expect(stdio.stdoutChunks.join('')).toMatch(/^check-prose: .*\n\nUsage: check-prose --file <path>/);
  });

  it.each([['--version'], ['-V']])('prints the package version for %s', async (flag) => {
    using stdio = captureStdio();

    expect(await runCheckProse([flag], workDir, programName)).toBe(0);
    expect(stdio.stdoutChunks.join('')).toBe(`${packageJson.version}\n`);
  });

  /** Writes `body.md` into the scratch directory and returns its absolute path. */
  async function writeBody(content: string): Promise<string> {
    const file = path.join(workDir, 'body.md');
    await writeFile(file, content);
    return file;
  }
});

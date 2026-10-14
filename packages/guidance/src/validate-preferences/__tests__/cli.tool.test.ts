import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runValidatePreferences } from '../cli.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const programName = 'validate-preferences';

describe(runValidatePreferences, () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'validate-preferences-cli-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("passes the repository's own `.agents/preferences.yaml` without any finding, even under --strict", async () => {
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--json', '--strict'], repoRoot, programName)).toBe(0);
    expect(readResults(stdio.stdoutChunks)).toEqual([
      expect.objectContaining({ present: true, valid: true, findings: [] }),
    ]);
  });

  it('exits 1 and reports every finding when the file has an error', async () => {
    const filePath = await writePreferences(
      workDir,
      'preferences.yaml',
      'project:\n  maturity: prod\n  maturty: hobby\ncommit: {}\n',
    );
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--json', filePath], workDir, programName)).toBe(1);
    expect(readResults(stdio.stdoutChunks)).toEqual([
      {
        file: filePath,
        present: true,
        valid: false,
        findings: [
          {
            level: 'error',
            path: 'project.maturity',
            message: 'must be one of "hobby", "early", "production" (got "prod")',
          },
          { level: 'warning', path: 'project.maturty', message: "unrecognized key; did you mean 'maturity'?" },
          { level: 'error', path: 'commit', message: "missing required key 'title_format'" },
        ],
      },
    ]);
  });

  it('prints each finding as a text line naming the file, and a summary line', async () => {
    await writePreferences(workDir, 'good.yaml', 'projct: {}\n');
    await writePreferences(workDir, 'bad.yaml', 'project:\n  maturity: prod\n');
    using stdio = captureStdio();
    expect(await runValidatePreferences(['good.yaml', 'bad.yaml'], workDir, programName)).toBe(1);
    expect(stdio.stdoutChunks.join('')).toBe(
      [
        "good.yaml: projct: warning: unrecognized key; did you mean 'project'?",
        'bad.yaml: project.maturity: error: must be one of "hobby", "early", "production" (got "prod")',
        'validate-preferences: 1 of 2 file(s) invalid',
        '',
      ].join('\n'),
    );
  });

  it('prints one JSON object per file under --json', async () => {
    await writePreferences(workDir, 'one.yaml', '');
    await writePreferences(workDir, 'two.yaml', 'projct: {}\n');
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--json', 'one.yaml', 'two.yaml'], workDir, programName)).toBe(0);
    expect(readResults(stdio.stdoutChunks)).toEqual([
      { file: path.join(workDir, 'one.yaml'), present: true, valid: true, findings: [] },
      expect.objectContaining({ file: path.join(workDir, 'two.yaml'), valid: true, findings: [expect.anything()] }),
    ]);
  });

  it('exits 0 when the file has only warnings, and 1 under --strict', async () => {
    await mkdir(path.join(workDir, '.agents'));
    await writeFile(path.join(workDir, '.agents', 'preferences.yaml'), 'projct: {}\n', 'utf8');
    using stdio = captureStdio();
    expect(await runValidatePreferences([], workDir, programName)).toBe(0);
    expect(await runValidatePreferences(['--strict'], workDir, programName)).toBe(1);
    expect(stdio.stdoutChunks.join('')).toContain('validate-preferences: 1 of 1 file(s) invalid');
  });

  it('accepts an absent default file and reports it as optional', async () => {
    using stdio = captureStdio();
    expect(await runValidatePreferences([], workDir, programName)).toBe(0);
    expect(stdio.stdoutChunks.join('')).toBe(
      `${path.join('.agents', 'preferences.yaml')}: not present; the file is optional\nvalidate-preferences: 1 file(s) valid\n`,
    );
  });

  it('exits 1 for a named file that is missing', async () => {
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--json', 'missing.yaml'], workDir, programName)).toBe(1);
    expect(readResults(stdio.stdoutChunks)).toEqual([
      {
        file: path.join(workDir, 'missing.yaml'),
        present: false,
        valid: false,
        findings: [{ level: 'error', path: '(root)', message: 'file not found' }],
      },
    ]);
  });

  it('exits 1 on malformed YAML', async () => {
    const filePath = await writePreferences(workDir, 'bad.yaml', 'project: [unclosed\n');
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--json', filePath], workDir, programName)).toBe(1);
    expect(readResults(stdio.stdoutChunks)).toEqual([
      expect.objectContaining({
        valid: false,
        findings: [{ level: 'error', path: '(root)', message: expect.stringMatching(/^malformed YAML: /) }],
      }),
    ]);
  });

  it('prints help to stdout and exits 0, ahead of argument validation', async () => {
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--bogus', '--help'], workDir, programName)).toBe(0);
    expect(stdio.stdoutChunks.join('')).toContain('Usage: validate-preferences [--json] [--strict] [file...]');
    expect(stdio.stderrChunks).toEqual([]);
  });

  it('reports an unknown option on stderr and exits 1', async () => {
    using stdio = captureStdio();
    expect(await runValidatePreferences(['--bogus'], workDir, programName)).toBe(1);
    expect(stdio.stdoutChunks).toEqual([]);
    expect(stdio.stderrChunks.join('')).toMatch(
      /^validate-preferences: .*--bogus.*; run validate-preferences --help for usage\n$/,
    );
  });
});

// region | Helpers

/** Parses the JSON lines that a run printed to stdout. */
function readResults(chunks: readonly string[]): unknown[] {
  return chunks
    .join('')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** Writes a preferences file into `dir` and returns its absolute path. */
async function writePreferences(dir: string, name: string, content: string): Promise<string> {
  const filePath = path.join(dir, name);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

// endregion | Helpers

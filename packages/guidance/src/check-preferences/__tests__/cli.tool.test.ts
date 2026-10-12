import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCheckPreferences } from '../cli.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

describe(runCheckPreferences, () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'check-preferences-cli-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it("passes the repository's own `.agents/preferences.yaml` without any finding", async () => {
    using stdio = captureStdio();
    expect(await runCheckPreferences([], repoRoot)).toBe(0);
    expect(readResult(stdio.stdoutChunks)).toMatchObject({ present: true, valid: true, findings: [] });
  });

  it('exits 1 and reports every finding when the file has an error', async () => {
    const filePath = path.join(workDir, 'preferences.yaml');
    await writeFile(filePath, 'project:\n  maturity: prod\n  maturty: hobby\ncommit: {}\n', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(1);
    expect(readResult(stdio.stdoutChunks)).toEqual({
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
    });
  });

  it('exits 0 when the file has only warnings', async () => {
    await mkdir(path.join(workDir, '.agents'));
    await writeFile(path.join(workDir, '.agents', 'preferences.yaml'), 'projct: {}\n', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([], workDir)).toBe(0);
    expect(readResult(stdio.stdoutChunks)).toMatchObject({ valid: true, findings: [{ level: 'warning' }] });
  });

  it('exits 0 for an empty file and for a missing one', async () => {
    const filePath = path.join(workDir, 'empty.yaml');
    await writeFile(filePath, '', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(0);
    expect(await runCheckPreferences(['missing.yaml'], workDir)).toBe(0);
    expect(readResult(stdio.stdoutChunks.slice(1))).toMatchObject({ present: false, valid: true });
  });

  it('exits 1 on malformed YAML', async () => {
    const filePath = path.join(workDir, 'bad.yaml');
    await writeFile(filePath, 'project: [unclosed\n', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(1);
    expect(readResult(stdio.stdoutChunks)).toMatchObject({
      valid: false,
      findings: [{ level: 'error', path: '(root)', message: expect.stringMatching(/^malformed YAML: /) }],
    });
  });
});

// region | Helpers

/** Parses the JSON result that a run printed to stdout. */
function readResult(chunks: readonly string[]): unknown {
  return JSON.parse(chunks.join(''));
}

// endregion | Helpers

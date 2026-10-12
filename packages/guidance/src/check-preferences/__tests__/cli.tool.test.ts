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

  it('passes the repository its own `.agents/preferences.yaml`', async () => {
    using stdio = captureStdio();
    expect(await runCheckPreferences([], repoRoot)).toBe(0);
    expect(stdio.stdoutChunks).toEqual([]);
  });

  it('exits 1 and prints every finding when the file has an error', async () => {
    const filePath = path.join(workDir, 'preferences.yaml');
    await writeFile(filePath, 'project:\n  maturity: prod\n  maturty: hobby\ncommit: {}\n', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(1);
    expect(stdio.stdoutChunks).toEqual([
      'error project.maturity: must be one of "hobby", "early", "production" (got "prod")\n',
      "warning project.maturty: unrecognized key; did you mean 'maturity'?\n",
      "error commit: missing required key 'title_format'\n",
    ]);
  });

  it('exits 0 when the file has only warnings', async () => {
    await mkdir(path.join(workDir, '.agents'));
    await writeFile(path.join(workDir, '.agents', 'preferences.yaml'), 'projct: {}\n', 'utf8');
    using _stdio = captureStdio();
    expect(await runCheckPreferences([], workDir)).toBe(0);
  });

  it('exits 0 for an empty file and for a missing one', async () => {
    const filePath = path.join(workDir, 'empty.yaml');
    await writeFile(filePath, '', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(0);
    expect(await runCheckPreferences(['missing.yaml'], workDir)).toBe(0);
    expect(stdio.stderrChunks).toContainEqual(expect.stringMatching(/missing\.yaml does not exist/));
  });

  it('exits 1 on malformed YAML', async () => {
    const filePath = path.join(workDir, 'bad.yaml');
    await writeFile(filePath, 'project: [unclosed\n', 'utf8');
    using stdio = captureStdio();
    expect(await runCheckPreferences([filePath], workDir)).toBe(1);
    expect(stdio.stdoutChunks).toContainEqual(expect.stringMatching(/^error \(root\): malformed YAML in /));
  });
});

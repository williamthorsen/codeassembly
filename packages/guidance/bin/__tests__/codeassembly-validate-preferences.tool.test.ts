import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const binPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../codeassembly-validate-preferences.js');

describe('codeassembly-validate-preferences', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'validate-preferences-bin-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('exits 0 and reports the file valid when it conforms', async () => {
    await writeFile(path.join(workDir, 'good.yaml'), 'project:\n  maturity: early\n', 'utf8');
    const result = runBin(['good.yaml'], workDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('codeassembly-validate-preferences: 1 file(s) valid\n');
  });

  it('exits 1 and names the failing key when the file does not conform', async () => {
    await writeFile(path.join(workDir, 'bad.yaml'), 'project:\n  maturity: prod\n', 'utf8');
    const result = runBin(['bad.yaml'], workDir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('bad.yaml: project.maturity: error: must be one of');
    expect(result.stdout).toContain('codeassembly-validate-preferences: 1 of 1 file(s) invalid');
  });
});

// region | Helpers

/** Runs the bin under the current Node with `args` in `cwd`, returning its exit status and output. */
function runBin(args: readonly string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [binPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// endregion | Helpers

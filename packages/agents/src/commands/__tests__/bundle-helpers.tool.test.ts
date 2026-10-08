import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { type CapturedStdio, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import { bundleHelpersCommand } from '../bundle-helpers.ts';

const MANIFEST = 'content/codeassembly-content.yaml';
const DEMO_HELPER = 'helpers:\n  - entry: ../src/demo/cli.ts\n    out: skills/demo/demo.mjs\n';

describe(bundleHelpersCommand, () => {
  let packageDir: string;
  let stdio: CapturedStdio;

  beforeEach(() => {
    stdio = disposeOnTestFinished(captureStdio({ includeConsole: true }));
    packageDir = makeProducer({
      [MANIFEST]: `format: 2\n${DEMO_HELPER}`,
      'src/demo/cli.ts': "console.log('demo');\n",
    });
  });

  it('bundles each declared helper into the content root', async () => {
    expect(await bundleHelpersCommand({ check: false, content: 'content' }, packageDir)).toBe(true);

    expect(readFileSync(join(packageDir, 'content/skills/demo/demo.mjs'), 'utf8')).toContain('demo');
  });

  it('passes the check once the fresh bundles are committed', async () => {
    await buildAndCommit(packageDir);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir)).toBe(true);
  });

  it('fails the check on a bundle that differs from a fresh build, naming the command that repairs it', async () => {
    await buildAndCommit(packageDir);
    writeFileSync(join(packageDir, 'src/demo/cli.ts'), "console.log('changed');\n", 'utf8');

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir)).toBe(false);
    expect(stdio.stderr).toContain('skills/demo/demo.mjs differs from a fresh build.');
    expect(stdio.stderr).toContain(
      'Run `codeassembly bundle-helpers --content content` and commit the regenerated bundles.',
    );
  });

  it('fails the check on a declared helper whose bundle is not recorded at HEAD', async () => {
    await buildAndCommit(packageDir);
    writeFile(packageDir, 'src/other/cli.ts', "console.log('other');\n");
    writeFile(packageDir, MANIFEST, `${DEMO_HELPER}  - entry: ../src/other/cli.ts\n    out: scripts/other.mjs\n`);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir)).toBe(false);
    expect(stdio.stderr).toContain('scripts/other.mjs is not recorded at HEAD.');
  });

  it('fails the check on a tracked bundle that no helper produces', async () => {
    await buildAndCommit(packageDir);
    writeFile(packageDir, 'content/scripts/stray.mjs', 'export {};\n');
    commitAll(packageDir);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir)).toBe(false);
    expect(stdio.stderr).toContain('scripts/stray.mjs is tracked but not produced by any helper.');
  });

  it('fails naming the directory when the content root does not exist', async () => {
    await expect(bundleHelpersCommand({ check: false, content: 'missing' }, packageDir)).rejects.toThrow(
      /missing is not a directory/,
    );
  });
});

// region | Helpers

/** Builds the bundles into the producer's content root and commits them. */
async function buildAndCommit(packageDir: string): Promise<void> {
  expect(await bundleHelpersCommand({ check: false, content: 'content' }, packageDir)).toBe(true);
  commitAll(packageDir);
}

/** Commits every change in the producer's repository. */
function commitAll(packageDir: string): void {
  execFileSync('git', ['-C', packageDir, 'add', '--all']);
  // The vitest git isolation nulls global config, so identity comes from the invocation.
  const identity = ['-c', 'user.email=test@example.com', '-c', 'user.name=Test'];
  execFileSync('git', ['-C', packageDir, ...identity, 'commit', '--quiet', '--message', 'commit']);
}

/** Creates a throwaway repository holding `files`, which a producer package's tests act on, and returns its path. */
function makeProducer(files: Record<string, string>): string {
  const packageDir = mkdtempSync(join(tmpdir(), 'bundle-helpers-'));
  onTestFinished(() => rmSync(packageDir, { force: true, recursive: true }));
  execFileSync('git', ['-C', packageDir, 'init', '--quiet']);
  for (const [relativePath, contents] of Object.entries(files)) {
    writeFile(packageDir, relativePath, contents);
  }
  commitAll(packageDir);
  return packageDir;
}

/** Writes `contents` at `relativePath` under `packageDir`, creating its directory. */
function writeFile(packageDir: string, relativePath: string, contents: string): void {
  const filePath = join(packageDir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
}

// endregion | Helpers

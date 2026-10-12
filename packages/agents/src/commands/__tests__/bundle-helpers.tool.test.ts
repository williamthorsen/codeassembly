import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import { type CapturedStdio, captureStdio } from '@williamthorsen/toolbelt.testing/candidate';
import { disposeOnTestFinished } from '@williamthorsen/toolbelt.vitest/candidate';
import { beforeEach, describe, expect, it, onTestFinished } from 'vitest';

import type { AgentsGit } from '../../lib/git.ts';
import { makeFakeGit } from '../../lib/test-utils/make-fake-git.ts';
import { bundleHelpersCommand } from '../bundle-helpers.ts';

const MANIFEST = 'content/codeassembly-content.yaml';
const DEMO_HELPER = 'helpers:\n  - entry: ../src/demo/cli.ts\n    out: skills/demo/demo.mjs\n';

describe(bundleHelpersCommand, () => {
  let packageDir: string;
  let stdio: CapturedStdio;
  let git: AgentsGit;

  beforeEach(() => {
    stdio = disposeOnTestFinished(captureStdio({ includeConsole: true }));
    packageDir = makeProducer({
      [MANIFEST]: `format: 2\n${DEMO_HELPER}`,
      'src/demo/cli.ts': "console.log('demo');\n",
    });
    git = commitAll(packageDir);
  });

  it('bundles each declared helper into the content root', async () => {
    expect(await bundleHelpersCommand({ check: false, content: 'content' }, packageDir)).toBe(true);

    expect(readFileSync(join(packageDir, 'content/skills/demo/demo.mjs'), 'utf8')).toContain('demo');
  });

  it('passes the check once the fresh bundles are committed', async () => {
    git = await buildAndCommit(packageDir);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir, git)).toBe(true);
  });

  it('fails the check on a bundle that differs from a fresh build, naming the command that repairs it', async () => {
    git = await buildAndCommit(packageDir);
    writeFileSync(join(packageDir, 'src/demo/cli.ts'), "console.log('changed');\n", 'utf8');

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir, git)).toBe(false);
    expect(stdio.stderr).toContain('skills/demo/demo.mjs differs from a fresh build.');
    expect(stdio.stderr).toContain(
      'Run `codeassembly bundle-helpers --content content` and commit the regenerated bundles.',
    );
  });

  it('fails the check on a declared helper whose bundle is not recorded at HEAD', async () => {
    git = await buildAndCommit(packageDir);
    writeFile(packageDir, 'src/other/cli.ts', "console.log('other');\n");
    writeFile(packageDir, MANIFEST, `${DEMO_HELPER}  - entry: ../src/other/cli.ts\n    out: scripts/other.mjs\n`);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir, git)).toBe(false);
    expect(stdio.stderr).toContain('scripts/other.mjs is not recorded at HEAD.');
  });

  it('fails the check on a tracked bundle that no helper produces', async () => {
    git = await buildAndCommit(packageDir);
    writeFile(packageDir, 'content/scripts/stray.mjs', 'export {};\n');
    git = commitAll(packageDir);

    expect(await bundleHelpersCommand({ check: true, content: 'content' }, packageDir, git)).toBe(false);
    expect(stdio.stderr).toContain('scripts/stray.mjs is tracked but not produced by any helper.');
  });

  it('fails naming the directory when the content root does not exist', async () => {
    await expect(bundleHelpersCommand({ check: false, content: 'missing' }, packageDir)).rejects.toThrow(
      /missing is not a directory/,
    );
  });
});

// region | Helpers

/** Builds the bundles into the producer's content root and commits them, returning the fake that records them. */
async function buildAndCommit(packageDir: string): Promise<AgentsGit> {
  expect(await bundleHelpersCommand({ check: false, content: 'content' }, packageDir)).toBe(true);
  return commitAll(packageDir);
}

/** Returns a fake git whose `HEAD` records every file now under the producer's content root. */
function commitAll(packageDir: string): AgentsGit {
  const contentRoot = join(packageDir, 'content');
  const files = readdirSync(contentRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  return makeFakeGit({
    headFiles: Object.fromEntries(files.map((filePath) => [relative(contentRoot, filePath), readFileSync(filePath)])),
  });
}

/** Creates a throwaway producer package holding `files` and returns its path. */
function makeProducer(files: Record<string, string>): string {
  const packageDir = mkdtempSync(join(tmpdir(), 'bundle-helpers-'));
  onTestFinished(() => rmSync(packageDir, { force: true, recursive: true }));
  for (const [relativePath, contents] of Object.entries(files)) {
    writeFile(packageDir, relativePath, contents);
  }
  return packageDir;
}

/** Writes `contents` at `relativePath` under `packageDir`, creating its directory. */
function writeFile(packageDir: string, relativePath: string, contents: string): void {
  const filePath = join(packageDir, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents, 'utf8');
}

// endregion | Helpers
